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
        <div className="fixed inset-0 bg-[#0a0a0c]/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 lg:p-8 animate-in fade-in duration-300">
            <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col relative">
                {/* Premium Header */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div className="flex justify-between items-center p-6 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                            <Eye className="h-6 w-6 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Creative Simulation</h2>
                            <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Template Rendering Engine</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    {isLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4">
                            <div className="h-12 w-12 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                            <p className="text-[10px] uppercase font-bold text-white/20 tracking-widest">Processing Templates...</p>
                        </div>
                    ) : (
                        <>
                            {/* Comparison Pane */}
                            <div className="flex-1 overflow-auto p-8 space-y-8 bg-black/40 border-r border-white/5">
                                {/* Headers Simulation */}
                                {headers && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Code className="h-4 w-4 text-indigo-400" />
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-white/60">Header Simulation</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-white/30 uppercase">Raw Template</p>
                                                <pre className="bg-[#050505] border border-white/10 rounded-xl p-4 text-[11px] font-mono text-white/60 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                                    {headers}
                                                </pre>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-green-400 uppercase">Simulated Output</p>
                                                <pre className="bg-green-500/5 border border-green-500/10 rounded-xl p-4 text-[11px] font-mono text-green-200/60 overflow-x-auto whitespace-pre-wrap leading-relaxed">
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
                                            <Layout className="h-4 w-4 text-indigo-400" />
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-white/60">Creative Body Simulation</h3>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-white/30 uppercase">Template Source</p>
                                                <div className="bg-[#050505] border border-white/10 rounded-xl p-4 max-h-[400px] overflow-auto">
                                                    <pre className="text-[11px] font-mono text-white/60 whitespace-pre-wrap leading-relaxed">{body}</pre>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Rendered Live Preview (Visual) */}
                            <div className="w-full lg:w-1/2 overflow-auto bg-[#0a0a0c] p-8 flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-indigo-400">
                                        <Sparkles className="h-4 w-4" />
                                        <span className="text-xs font-bold uppercase tracking-widest">Visual Simulation</span>
                                    </div>
                                    <Badge variant="outline" className="border-indigo-500/20 text-indigo-400 bg-indigo-500/10 uppercase text-[9px]">High Fidelity</Badge>
                                </div>

                                <div className="bg-white rounded-xl shadow-2xl overflow-hidden min-h-[600px] flex flex-col">
                                    <div className="h-10 bg-gray-50 border-b border-gray-100 flex items-center px-4 gap-2">
                                        <div className="flex-1 mx-4 h-5 bg-black/5 rounded flex items-center px-2 text-[9px] text-black/20 font-mono">
                                            Secure Preview Mode
                                        </div>
                                    </div>
                                    <div className="flex-1 p-8 text-black leading-relaxed">
                                        {renderedBody ? (
                                            <div dangerouslySetInnerHTML={{ __html: renderedBody }} />
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center opacity-10 py-24">
                                                <Sparkles className="h-16 w-16 mb-4" />
                                                <p className="font-bold uppercase tracking-widest text-xs">Simulate Dispatch</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
                                    <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4 text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-indigo-200">Simulation Insight</p>
                                        <p className="text-[10px] text-white/40 mt-1 italic">
                                            This preview simulates the final rendered HTML that will be transmitted via Google Workplace SMTP.
                                            Random tags like [rndn_5] are dynamically re-calculated on each dispatch generation.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Action */}
                <div className="border-t border-white/5 p-6 bg-black/20 flex justify-end gap-3">
                    <Button
                        onClick={onClose}
                        variant="outline"
                        className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white"
                    >
                        Close Preview
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default TemplatePreview;
