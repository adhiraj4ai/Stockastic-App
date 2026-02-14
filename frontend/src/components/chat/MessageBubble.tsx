import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { ToolStatus } from './ToolStatus';
import remarkGfm from 'remark-gfm';
import { GenUIContainer } from './gen-ui/GenUIRegistry';

interface MessageBubbleProps {
    role: 'user' | 'assistant' | 'system';
    content: string;
    isStreaming?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content, isStreaming }) => {
    // Helper to render content with tool visualizations
    const renderContent = (text: string) => {
        // Remove raw TOOL_CALL: ... patterns from the display
        // Matches: TOOL_CALL: name(args) or [TOOL_CALL: name(args)]
        const cleanedText = text.replace(/\[?TOOL_CALL:\s*\w+\(.*?\).*?\]?/g, "").trim();

        // Regex to match tool usage: 🔧 **Using Tool**: `tool_name` with args: `json_args`
        // And potentially: ✅ **Tool Executed** (which implies the previous tool finished)

        // We split by lines looking for the specific marker
        const parts = cleanedText.split(/(\n\n🔧 \*\*Using Tool\*\*: `.*?` with args: `.*?`\n\n)/g);

        return parts.map((part, index) => {
            // Check if this part is a tool call marker
            const toolMatch = part.match(/🔧 \*\*Using Tool\*\*: `(.*?)` with args: `(.*?)`/);

            if (toolMatch) {
                const [, toolName, args] = toolMatch;
                return (
                    <ToolStatus
                        key={index}
                        toolName={toolName}
                        args={args}
                        isFinished={true} // For now assume finished if rendered, or we could check next part
                    />
                );
            }

            // Render regular markdown text
            if (!part.trim()) return null;

            return (
                <div key={index} className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '')
                                const language = match ? match[1] : '';

                                if (language === 'gen-ui') {
                                    try {
                                        // Clean the JSON string: strip potential markdown artifacts or whitespace
                                        const rawContent = String(children).trim();
                                        const cleanContent = rawContent.replace(/^```json\s*|```$/g, '').trim();
                                        const data = JSON.parse(cleanContent);

                                        if (!data.component || !data.data) {
                                            throw new Error("Missing 'component' or 'data' field");
                                        }

                                        return <GenUIContainer component={data.component} data={data.data} />;
                                    } catch (e: any) {
                                        console.error("Gen-UI Parse Error:", e);
                                        return (
                                            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-md my-4">
                                                <div className="flex items-center gap-2 text-rose-500 font-bold text-xs uppercase tracking-wider mb-2">
                                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                                    Rendering Error
                                                </div>
                                                <p className="text-sm text-gray-400 font-mono break-all bg-black/20 p-2 rounded">
                                                    {e.message || "Invalid Gen-UI JSON structure"}
                                                </p>
                                            </div>
                                        );
                                    }
                                }

                                return match ? (
                                    <div className="relative group rounded-lg overflow-hidden my-4 border border-gray-800">
                                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
                                            <span className="text-xs text-gray-500 font-mono">{match[1]}</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(String(children))}
                                                className="text-gray-500 hover:text-gray-300 transition-colors"
                                                title="Copy code"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        </div>
                                        <SyntaxHighlighter
                                            style={vscDarkPlus as any}
                                            language={match[1]}
                                            PreTag="div"
                                            customStyle={{ margin: 0, padding: '1rem', background: '#0a0a0a' }}
                                        >
                                            {String(children).replace(/\n$/, '')}
                                        </SyntaxHighlighter>
                                    </div>
                                ) : (
                                    <code className="bg-gray-800/50 text-emerald-300 px-1.5 py-0.5 rounded-md text-sm font-mono border border-gray-700/50" {...props}>
                                        {children}
                                    </code>
                                )
                            },
                            p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-4 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-4 space-y-1">{children}</ol>,
                            blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-emerald-500/50 pl-4 py-1 my-4 bg-emerald-500/5 rounded-r-lg italic text-gray-300">
                                    {children}
                                </blockquote>
                            ),
                            a: ({ href, children }) => (
                                <a href={href} className="text-emerald-400 hover:text-emerald-300 underline decoration-emerald-500/30 underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer">
                                    {children}
                                </a>
                            ),
                            table: ({ children }) => (
                                <div className="overflow-auto my-4 rounded-xl border border-gray-200 dark:border-gray-800 max-h-[500px] shadow-sm custom-scrollbar">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 border-collapse">
                                        {children}
                                    </table>
                                </div>
                            ),
                            th: ({ children }) => (
                                <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider backdrop-blur-sm bg-opacity-90 dark:bg-opacity-90 border-b border-gray-200 dark:border-gray-800">
                                    {children}
                                </th>
                            ),
                            td: ({ children }) => (
                                <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800/50 bg-white dark:bg-transparent">
                                    {children}
                                </td>
                            ),
                        }}
                    >
                        {part}
                    </ReactMarkdown>
                </div>
            );
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-4 ${role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
            {role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border border-emerald-500/20 flex items-center justify-center shrink-0 backdrop-blur-md shadow-lg shadow-emerald-900/10 dark:from-emerald-600/20 dark:to-emerald-900/20 dark:border-emerald-500/20 bg-emerald-100 border-emerald-200">
                    <Bot size={18} className="text-emerald-600 dark:text-emerald-400" />
                </div>
            )}

            <div className={`
                max-w-[85%] rounded-2xl px-5 py-4 shadow-xl backdrop-blur-md border
                ${role === 'user'
                    ? 'bg-emerald-600/90 border-emerald-500/50 text-white shadow-emerald-900/20 from-emerald-600 to-emerald-500 bg-gradient-to-br'
                    : 'bg-white/80 border-gray-200 text-gray-800 shadow-gray-200/50 dark:bg-gray-900/60 dark:border-gray-800/60 dark:text-gray-100 dark:shadow-black/20'}
            `}>
                {renderContent(content)}

                {isStreaming && role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mt-2 h-4">
                        <span className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse"></span>
                    </div>
                )}
            </div>

            {role === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 shadow-lg dark:bg-gray-800/80 dark:border-gray-700/50">
                    <User size={18} className="text-gray-600 dark:text-gray-300" />
                </div>
            )}
        </motion.div>
    );
};
