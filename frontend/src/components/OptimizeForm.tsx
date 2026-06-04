import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Optimization Form Component - JSON Version
function OptimizeForm({ onOptimize, onCancel, optimizing }: any) {
    const [nTrials, setNTrials] = useState(50);
    const [paramJson, setParamJson] = useState(JSON.stringify({
        "n1": [5, 30],
        "n2": [20, 100]
    }, null, 2));
    const [jsonError, setJsonError] = useState('');

    const handleSubmit = () => {
        try {
            const paramRanges = JSON.parse(paramJson);

            // Validate format
            for (const [key, value] of Object.entries(paramRanges)) {
                if (!Array.isArray(value) || value.length !== 2) {
                    setJsonError(`Invalid format for "${key}". Expected [min, max] array.`);
                    return;
                }
            }

            setJsonError('');
            onOptimize(paramRanges, nTrials);
        } catch (error) {
            setJsonError('Invalid JSON format. Please check your syntax.');
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Number of Trials</Label>
                <Input
                    type="number"
                    value={nTrials}
                    onChange={(e) => setNTrials(parseInt(e.target.value))}
                    min={10}
                    max={200}
                    className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">More trials = better results but slower (recommended: 50-100)</p>
            </div>

            <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Parameter Ranges (JSON)</Label>
                <textarea
                    value={paramJson}
                    onChange={(e) => {
                        setParamJson(e.target.value);
                        setJsonError('');
                    }}
                    className="w-full h-48 p-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder='{\n "n1": [5, 30],\n "n2": [20, 100]\n}'
                />
                {jsonError && (
                    <p className="text-xs text-red-600 mt-1">{jsonError}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                    Format: <code className="bg-gray-100 px-1 rounded">{"{ \"param_name\": [min, max] }"}</code>
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 font-medium mb-1">Example:</p>
                    <pre className="text-xs text-blue-700 font-mono">
                        {`{
  "n1": [5, 30],
  "n2": [20, 100],
  "rsi_period": [10, 20]
}`}
                    </pre>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onCancel} disabled={optimizing}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={optimizing} className="bg-purple-600 hover:bg-purple-700">
                    {optimizing ? 'Optimizing...' : 'Start Optimization'}
                </Button>
            </div>
        </div>
    );
}
