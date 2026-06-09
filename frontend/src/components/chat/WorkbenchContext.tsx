'use client';

import { createContext, useContext } from 'react';

export interface WorkbenchTool {
    tool: string;
    input: Record<string, unknown>;
    result?: { text: string; isError: boolean };
    subagent?: string;
}

interface WorkbenchContextType {
    selectedTool: WorkbenchTool | null;
    selectTool: (tool: WorkbenchTool | null) => void;
}

export const WorkbenchContext = createContext<WorkbenchContextType>({
    selectedTool: null,
    selectTool: () => {},
});

export function useWorkbench() {
    return useContext(WorkbenchContext);
}
