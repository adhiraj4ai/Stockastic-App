import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface Log {
    id: number;
    file_name: string;
    upload_type: string;
    status: string;
    records_count: number;
    error_message: string | null;
    created_at: string;
}

interface UploadHistoryTableProps {
    logs: Log[];
    loading: boolean;
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export default function UploadHistoryTable({ logs, loading, currentPage, totalPages, onPageChange }: UploadHistoryTableProps) {
    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="h-12">Date</TableHead>
                            <TableHead className="h-12">Type</TableHead>
                            <TableHead className="h-12">Status</TableHead>
                            <TableHead className="text-right h-12">Records</TableHead>
                            <TableHead className="h-12">File Name</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-64 text-center text-gray-500">
                                    Loading history...
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-64 text-center text-gray-500">
                                    No upload history found
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} className="h-16">
                                    <TableCell className="font-medium text-gray-600">
                                        {format(new Date(log.created_at), 'MMM d, h:mm a')}
                                    </TableCell>
                                    <TableCell>{log.upload_type}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={log.status === 'SUCCESS' ? 'default' : 'destructive'}
                                            className={`
                                                ${log.status === 'SUCCESS' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}
                                                border-0 shadow-none
                                            `}
                                        >
                                            {log.status === 'SUCCESS' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                            {log.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {log.records_count?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-gray-400" />
                                            <span className="font-medium">{log.file_name}</span>
                                        </div>
                                        {log.error_message && (
                                            <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {log.error_message}
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                    <p className="text-sm text-gray-500">
                        Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1 || loading}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || loading}
                        >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
