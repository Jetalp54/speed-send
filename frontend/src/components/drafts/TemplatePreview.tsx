'use client';

import React from 'react';
import { X, Eye } from 'lucide-react';

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <Eye className="h-6 w-6 text-blue-600" />
                        <h2 className="text-2xl font-bold">Template Preview</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Headers Section */}
                            {headers && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">Email Headers</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {/* Template */}
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 mb-2">Template</p>
                                            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                                {headers}
                                            </pre>
                                        </div>
                                        {/* Rendered */}
                                        <div>
                                            <p className="text-sm font-medium text-green-700 mb-2">Rendered (Sample)</p>
                                            <pre className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                                {renderedHeaders || 'Click "Preview" to see rendered output'}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Body Section */}
                            {body && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">Email Body</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {/* Template */}
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 mb-2">Template</p>
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                                                <pre className="text-sm font-mono whitespace-pre-wrap">{body}</pre>
                                            </div>
                                        </div>
                                        {/* Rendered */}
                                        <div>
                                            <p className="text-sm font-medium text-green-700 mb-2">Rendered (Sample)</p>
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                                                {renderedBody ? (
                                                    <div dangerouslySetInnerHTML={{ __html: renderedBody }} />
                                                ) : (
                                                    <p className="text-gray-500 text-sm">Click "Preview" to see rendered output</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Info Box */}
                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                                <p className="text-sm text-blue-700">
                                    <strong>Note:</strong> Random generation tags ([rndn_N], [rnda_N], etc.) produce different values each time.
                                    This preview shows sample data with randomly generated values.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 p-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TemplatePreview;
