'use client';

import React from 'react';
import { X, Eye, Sparkles, Code, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface TemplatePreviewProps {
    isOpen: boolean;
    onClose: () => void;
    headers?: string;
    body?: string;
    renderedHeaders?: string;
    renderedBody?: string;
    isLoading?: boolean;
}

export function TemplatePreview({
    isOpen,
    onClose,
    headers,
    body,
    renderedHeaders,
    renderedBody,
    isLoading = false
}: TemplatePreviewProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col relative">
                <div className="flex justify-between items-center p-6 border-b bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Eye className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">Creative Simulation</h2>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Template Rendering Engine</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    {isLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4">
                            <div className="h-12 w-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Processing Templates...</p>
                        </div>
                    ) : (
                        <>
                            {/* Comparison Pane */}
                            <div className="flex-1 overflow-auto p-8 space-y-8 bg-muted/20 border-r">
                                {/* Headers Simulation */}
                                {headers && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Code className="h-4 w-4 text-primary" />
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Header Simulation</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Raw Template</p>
                                                <pre className="bg-background border rounded-xl p-4 text-[11px] font-mono text-foreground/70 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-sm">
                                                    {headers}
                                                </pre>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-primary uppercase">Simulated Output</p>
                                                <pre className="bg-primary/[0.03] border border-primary/10 rounded-xl p-4 text-[11px] font-mono text-primary/80 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-sm">
                                                    {renderedHeaders || '// Dispatch Preview to generate output'}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Body Simulation */}
                                {body && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Layout className="h-4 w-4 text-primary" />
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Creative Body Simulation</h3>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Template Source</p>
                                                <div className="bg-background border rounded-xl p-4 max-h-[400px] overflow-auto shadow-sm">
                                                    <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed">{body}</pre>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Rendered Live Preview (Visual) */}
                            <div className="w-full lg:w-1/2 overflow-auto bg-background p-8 flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-primary">
                                        <Sparkles className="h-4 w-4" />
                                        <span className="text-xs font-bold uppercase tracking-widest">Visual Simulation</span>
                                    </div>
                                    <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 uppercase text-[9px]">High Fidelity</Badge>
                                </div>

                                <div className="bg-white text-black border rounded-xl shadow-xl overflow-hidden min-h-[600px] flex flex-col">
                                    <div className="h-10 bg-gray-50 border-b flex items-center px-4 gap-2">
                                        <div className="flex-1 mx-4 h-5 bg-black/5 rounded flex items-center px-2 text-[9px] text-black/20 font-mono italic">
                                            Secure Sandbox Mode
                                        </div>
                                    </div>
                                    <div className="flex-1 p-8 overflow-auto leading-relaxed">
                                        {renderedBody ? (
                                            <div dangerouslySetInnerHTML={{ __html: renderedBody }} />
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center opacity-10 py-24">
                                                <Sparkles className="h-16 w-16 mb-4" />
                                                <p className="font-bold uppercase tracking-widest text-xs text-black">Awaiting Generation...</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl flex items-start gap-3">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-primary">Simulation Insight</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 italic leading-relaxed">
                                            This preview simulates the final rendered HTML that will be transmitted via Google Workplace SMTP.
                                            Random tags like [rndn_5] are dynamically re-calculated on each dispatch generation.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="border-t p-6 bg-muted/30 flex justify-end gap-3">
                    <Button
                        onClick={onClose}
                        variant="outline"
                    >
                        Close Preview
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default TemplatePreview;
