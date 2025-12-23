import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
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
}

export default function UploadHistoryTable({ logs, loading }: UploadHistoryTableProps) {
    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <History className="w-5 h-5 text-gray-500" />
                    Recent Upload History
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>File Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Records</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                                        Loading history...
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                                        No upload history found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-medium text-gray-600">
                                            {format(new Date(log.created_at), 'MMM d, h:mm a')}
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
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
