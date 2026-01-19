import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'; // Assuming Tabs component exists, if not I'll use simple state
import { Upload, FileJson, Clipboard, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface UploadAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpload: (name: string, jsonContent: string) => Promise<void>;
}

export function UploadAccountDialog({
    open,
    onOpenChange,
    onUpload
}: UploadAccountDialogProps) {
    const [name, setName] = useState('');
    const [jsonContent, setJsonContent] = useState('');
    const [uploadMethod, setUploadMethod] = useState<'file' | 'paste'>('file');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setJsonContent(event.target?.result as string);
            setError(null);
        };
        reader.readAsText(file);
    };

    const validateAndSubmit = async () => {
        setError(null);
        if (!name.trim()) {
            setError('Account name is required');
            return;
        }
        if (!jsonContent.trim()) {
            setError('JSON content is required');
            return;
        }

        try {
            JSON.parse(jsonContent);
        } catch {
            setError('Invalid JSON format');
            return;
        }

        setIsSubmitting(true);
        try {
            await onUpload(name, jsonContent);
            // Reset form on success
            setName('');
            setJsonContent('');
            onOpenChange(false);
        } catch (e: any) {
            // Error is handled by parent or displayed here?
            // Parent usually shows toast. But we can show unexpected error here too.
            console.error(e);
            // Keep dialog open if error
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add Service Account</DialogTitle>
                    <DialogDescription>
                        Upload your Google Cloud service account JSON key. Ensure domain-wide delegation is enabled.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Account Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Marketing Team Account"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>JSON Credential</Label>
                        <div className="flex gap-2 mb-2">
                            <Button
                                type="button"
                                variant={uploadMethod === 'file' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setUploadMethod('file')}
                            >
                                <FileJson className="mr-2 h-4 w-4" />
                                Upload File
                            </Button>
                            <Button
                                type="button"
                                variant={uploadMethod === 'paste' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setUploadMethod('paste')}
                            >
                                <Clipboard className="mr-2 h-4 w-4" />
                                Paste JSON
                            </Button>
                        </div>

                        {uploadMethod === 'file' ? (
                            <div className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors">
                                <Input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    id="file-upload"
                                    onChange={handleFileUpload}
                                />
                                <Label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full">
                                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                    <span className="text-sm font-medium">Click to browse</span>
                                    <span className="text-xs text-muted-foreground">.json files only</span>
                                </Label>
                                {jsonContent && (
                                    <div className="mt-4 text-sm text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full">
                                        File selected ({jsonContent.length} bytes)
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Textarea
                                placeholder="Paste the contents of your credentials.json here..."
                                className="font-mono text-xs h-40"
                                value={jsonContent}
                                onChange={(e) => setJsonContent(e.target.value)}
                            />
                        )}
                    </div>

                    {error && (
                        <div className="text-sm text-red-500 bg-red-50 p-2 rounded border border-red-200">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={validateAndSubmit} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            'Add Account'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
