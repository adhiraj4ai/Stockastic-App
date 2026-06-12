/**
 * Frontend mirror of the backend's chat block schema.
 * Mirrors backend/chat/streaming.py frame kinds.
 */

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
}

export type BlockKind =
    | 'text'
    | 'thinking'
    | 'subagent_start'
    | 'subagent_end'
    | 'tool_use'
    | 'tool_result'
    | 'card';

export interface BaseBlock {
    kind: BlockKind;
    subagent?: string | null;
}

export interface TextBlock extends BaseBlock {
    kind: 'text';
    text: string;
}

export interface ThinkingBlock extends BaseBlock {
    kind: 'thinking';
    text: string;
}

export interface SubagentStartBlock extends BaseBlock {
    kind: 'subagent_start';
    parent: string;
    model?: string;
}

export interface SubagentEndBlock extends BaseBlock {
    kind: 'subagent_end';
}

export interface ToolUseBlock extends BaseBlock {
    kind: 'tool_use';
    tool: string;
    input: Record<string, unknown>;
    id: string;
}

export interface ToolResultBlock extends BaseBlock {
    kind: 'tool_result';
    id: string;
    is_error: boolean;
    text: string;
}

export interface CardBlock extends BaseBlock {
    kind: 'card';
    type: string;
    data: any;
    tool?: string;
}

export type ChatBlock =
    | TextBlock
    | ThinkingBlock
    | SubagentStartBlock
    | SubagentEndBlock
    | ToolUseBlock
    | ToolResultBlock
    | CardBlock;

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    blocks: ChatBlock[];
    created_at: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
}

export interface SavedAnalysis {
    id: string;
    session: string | null;
    title: string;
    summary?: string;        // present on detail, omitted from list/suggest
    one_liner: string;
    category: string;
    tags: string[];
    tickers: string[];
    series_key: string;
    verdict: string;
    structured?: Record<string, unknown>;
    created_at: string;
    updated_at?: string;
}

export interface SavedAnalysisDraft {
    session: string;
    title: string;
    summary: string;
    one_liner: string;
    category: string;
    tags: string[];
    tickers: string[];
    series_key: string;
    verdict: string;
    structured: Record<string, unknown>;
    degraded: boolean;
}
