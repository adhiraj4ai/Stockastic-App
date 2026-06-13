"""Deterministic chat slash commands — handled server-side without the LLM.

A command message never reaches the Claude Agent SDK: views.send intercepts it,
runs the handler synchronously, and streams the reply using the same SSE frame
vocabulary the normal pipeline emits.
"""
import re
from dataclasses import dataclass

_COMMAND_RE = re.compile(r"^/(?P<name>[a-zA-Z]+)(?:\s+(?P<args>.*\S))?\s*$", re.DOTALL)

HELP_TEXT = """Available commands:
/memory — list everything I remember about you
/memory add <fact> — remember a new fact
/memory edit <n> <new text> — replace fact n (numbers from /memory)
/memory forget <n or text> — forget by number or matching text
/memory clear confirm — forget everything
/help — this message

Anything else you type goes to the assistant as usual."""


@dataclass
class Command:
    name: str
    args: str


def parse_command(prompt: str):
    """Command for a leading-slash message, else None. '//' escapes to plain text."""
    text = (prompt or "").strip()
    if not text.startswith("/") or text.startswith("//"):
        return None
    m = _COMMAND_RE.match(text)
    if not m:
        return None
    return Command(name=m.group("name").lower(), args=(m.group("args") or "").strip())


def _clean_fact(raw: str) -> str:
    # Mirrors chat.tools._clean_fact (not imported: tools.py pulls the agent SDK).
    return " ".join(str(raw or "").split())[:220]


def _facts(user):
    from chat.models import UserMemory
    return list(UserMemory.objects.filter(user=user))


def _render_list(memories) -> str:
    if not memories:
        return "I have no facts saved about you yet. Use `/memory add <fact>` or just tell me something to remember."
    lines = ["What I remember about you:"]
    lines += [f"{i}. {m.content}" for i, m in enumerate(memories, 1)]
    lines.append("\nEdit with `/memory edit <n> <new text>`, remove with `/memory forget <n>`.")
    return "\n".join(lines)


def _memory_add(user, rest: str) -> str:
    from chat.models import UserMemory
    fact = _clean_fact(rest)
    if not fact:
        return "Usage: /memory add <fact>"
    if UserMemory.objects.filter(user=user, content=fact).exists():
        return f"Already remembered: {fact}"
    if UserMemory.objects.filter(user=user).count() >= UserMemory.MAX_FACTS_PER_USER:
        return (f"Memory is full ({UserMemory.MAX_FACTS_PER_USER} facts). "
                "Remove one first with /memory forget <n>.")
    UserMemory.objects.create(user=user, content=fact)
    return f"Remembered: {fact}"


def _memory_forget(user, rest: str) -> str:
    if not rest:
        return "Usage: /memory forget <n or text>"
    memories = _facts(user)
    if rest.isdigit():
        idx = int(rest)
        if not 1 <= idx <= len(memories):
            return f"No fact #{idx} — there are {len(memories)} (see /memory)."
        target = memories[idx - 1]
        target.delete()
        return f"Forgot: {target.content}"
    hits = [m for m in memories if rest.lower() in m.content.lower()]
    if not hits:
        return f"No remembered facts match '{rest}'."
    for m in hits:
        m.delete()
    return "Forgot:\n" + "\n".join(f"- {m.content}" for m in hits)


def _memory_edit(user, rest: str) -> str:
    idx_str, _, new_text = rest.partition(" ")
    new_fact = _clean_fact(new_text)
    if not idx_str.isdigit() or not new_fact:
        return "Usage: /memory edit <n> <new text> (numbers from /memory)"
    memories = _facts(user)
    idx = int(idx_str)
    if not 1 <= idx <= len(memories):
        return f"No fact #{idx} — there are {len(memories)} (see /memory)."
    target = memories[idx - 1]
    old = target.content
    target.content = new_fact
    target.save(update_fields=["content", "updated_at"])
    return f"Updated fact {idx}:\n- was: {old}\n- now: {new_fact}"


def _memory_clear(user, rest: str) -> str:
    from chat.models import UserMemory
    memories = _facts(user)
    if rest.lower() != "confirm":
        return (f"This deletes all {len(memories)} remembered fact(s). "
                "Send `/memory clear confirm` to proceed.")
    count = len(memories)
    UserMemory.objects.filter(user=user).delete()
    return f"Cleared {count} fact(s). I no longer remember anything about you."


_MEMORY_SUBCOMMANDS = {
    "add": _memory_add,
    "forget": _memory_forget,
    "edit": _memory_edit,
    "clear": _memory_clear,
}


def _handle_memory(user, args: str) -> str:
    sub, _, rest = args.partition(" ")
    sub = sub.lower()
    rest = rest.strip()

    if sub in ("", "list"):
        return _render_list(_facts(user))

    handler = _MEMORY_SUBCOMMANDS.get(sub)
    if handler:
        return handler(user, rest)
    return f"Unknown /memory subcommand '{sub}'. {HELP_TEXT}"


def handle_command(user, command: Command) -> str:
    if command.name == "memory":
        return _handle_memory(user, command.args)
    if command.name == "help":
        return HELP_TEXT
    return f"Unknown command /{command.name}.\n\n{HELP_TEXT}"
