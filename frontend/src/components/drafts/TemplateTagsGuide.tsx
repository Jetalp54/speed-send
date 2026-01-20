'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Search, Info } from 'lucide-react';

interface Tag {
    tag: string;
    description: string;
    example: string;
    charset: string;
}

interface TemplateTagsGuideProps {
    onInsertTag?: (tag: string) => void;
    showInsertButton?: boolean;
}

export function TemplateTagsGuide({ onInsertTag, showInsertButton = true }: TemplateTagsGuideProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedTag, setCopiedTag] = useState<string | null>(null);

    const randomTags: Tag[] = [
        { tag: '[rndn_N]', description: 'Random digits (0-9)', example: '[rndn_10] → 1234567890', charset: '0-9' },
        { tag: '[rnda_N]', description: 'Random alphanumeric', example: '[rnda_8] → aB3cD4eF', charset: 'A-Z a-z 0-9' },
        { tag: '[rndl_N]', description: 'Random lowercase', example: '[rndl_6] → abcdef', charset: 'a-z' },
        { tag: '[rndu_N]', description: 'Random uppercase', example: '[rndu_6] → ABCDEF', charset: 'A-Z' },
        { tag: '[rnds_N]', description: 'Random symbols', example: '[rnds_5] → *-_#@', charset: '*-_#@!$%&+=?' },
        { tag: '[rndlu_N]', description: 'Random letters', example: '[rndlu_8] → AbCdEfGh', charset: 'A-Z a-z' },
        { tag: '[rndln_N]', description: 'Random lowercase + digits', example: '[rndln_8] → abc123de', charset: 'a-z 0-9' },
        { tag: '[rndun_N]', description: 'Random uppercase + digits', example: '[rndun_8] → ABC123DE', charset: 'A-Z 0-9' },
    ];

    const systemTags = [
        { tag: '[smtp]', description: 'SMTP username (user email)', example: '[smtp] → user@example.com' },
        { tag: '[from]', description: 'From name', example: '[from] → John Doe' },
        { tag: '[subject]', description: 'Email subject', example: '[subject] → Your subject here' },
        { tag: '[to]', description: 'Recipient email', example: '[to] → recipient@example.com' },
        { tag: '[date]', description: 'Current date/time', example: '[date] → Mon, 20 Jan 2026 15:30:00 +0000' },
        { tag: '[Message-ID]', description: 'Unique message ID', example: '[Message-ID] → <12345-abc@domain.com>' },
    ];

    const filteredRandomTags = randomTags.filter(t =>
        t.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredSystemTags = systemTags.filter(t =>
        t.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCopyTag = (tag: string) => {
        navigator.clipboard.writeText(tag);
        setCopiedTag(tag);
        setTimeout(() => setCopiedTag(null), 2000);
    };

    const handleInsertTag = (tag: string) => {
        if (onInsertTag) {
            onInsertTag(tag);
        }
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
            <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Template Tags Reference</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search tags..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Random Generation Tags */}
            <div className="mb-6">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm">Random Generation</span>
                </h4>
                <div className="space-y-2">
                    {filteredRandomTags.map((tag) => (
                        <div key={tag.tag} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                            <div className="flex items-start justify-between mb-1">
                                <code className="text-sm font-mono bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                    {tag.tag}
                                </code>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleCopyTag(tag.tag)}
                                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                                        title="Copy tag"
                                    >
                                        {copiedTag === tag.tag ? (
                                            <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Copy className="h-4 w-4 text-gray-600" />
                                        )}
                                    </button>
                                    {showInsertButton && onInsertTag && (
                                        <button
                                            onClick={() => handleInsertTag(tag.tag)}
                                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                        >
                                            Insert
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">{tag.description}</p>
                            <p className="text-xs text-gray-500 font-mono">{tag.example}</p>
                            <p className="text-xs text-gray-400 mt-1">Charset: {tag.charset}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* System Tags */}
            <div>
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">System Tags</span>
                </h4>
                <div className="space-y-2">
                    {filteredSystemTags.map((tag) => (
                        <div key={tag.tag} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                            <div className="flex items-start justify-between mb-1">
                                <code className="text-sm font-mono bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                    {tag.tag}
                                </code>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleCopyTag(tag.tag)}
                                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                                        title="Copy tag"
                                    >
                                        {copiedTag === tag.tag ? (
                                            <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Copy className="h-4 w-4 text-gray-600" />
                                        )}
                                    </button>
                                    {showInsertButton && onInsertTag && (
                                        <button
                                            onClick={() => handleInsertTag(tag.tag)}
                                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                        >
                                            Insert
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">{tag.description}</p>
                            <p className="text-xs text-gray-500 font-mono">{tag.example}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Usage Notes */}
            <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                <div className="flex gap-2">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700">
                        <p className="font-semibold mb-1">Usage Notes:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                            <li>N in random tags = length (1-256)</li>
                            <li>Random tags generate different values each time</li>
                            <li>Tags are case-sensitive</li>
                            <li>Example: [rnda_10] = 10 random alphanumeric characters</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TemplateTagsGuide;
