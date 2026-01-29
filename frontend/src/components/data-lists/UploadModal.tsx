'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { X, Upload, FileSpreadsheet, CheckCircle, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

// Define the props for the component
interface UploadModalProps {
  onClose: () => void;
  onUpload: (file: File, listName: string, metadata: { type: string, isp: string, geo: string }) => void;
}

export function UploadModal({ onClose, onUpload }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [listName, setListName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  // New Metadata State
  const [listType, setListType] = useState('Fresh');
  const [isp, setIsp] = useState('Mixed');
  const [geo, setGeo] = useState('Mixed');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewData(null);

      // Auto-upload for preview
      await handleFilePreview(selectedFile);
    }
  };

  const handleFilePreview = async (uploadFile: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await fetch('/api/v1/data-lists/upload-file', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to parse file');
      }

      const data = await response.json();
      setPreviewData(data);

      // Auto-fill list name if empty
      if (!listName && uploadFile.name) {
        const nameWithoutExt = uploadFile.name.replace(/\.[^/.]+$/, "");
        setListName(nameWithoutExt);
      }
    } catch (error: any) {
      console.error('File preview error:', error);
      alert(`Failed to parse file: ${error.message}`);
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!previewData || !listName) return;

    setUploading(true);
    try {
      // Create data list with extracted emails
      const response = await apiClient.request('/api/v1/data-lists', {
        method: 'POST',
        body: JSON.stringify({
          name: listName,
          description: `Imported from ${file?.name || 'file'} - ${previewData.detected_column}`,
          recipients: previewData.emails,
          list_type: listType
        })
      });

      if (response.error) throw new Error(response.error);

      alert(`Successfully created list "${listName}" with ${previewData.total} emails!`);
      onClose();
      window.location.reload(); // Refresh to show new list
    } catch (error: any) {
      console.error('Create list error:', error);
      alert(`Failed to create list: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Upload Data List
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="listName">List Name</Label>
            <Input
              id="listName"
              placeholder="Enter a name for your list"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>List Type</Label>
              <Select value={listType} onValueChange={setListType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fresh">Fresh</SelectItem>
                  <SelectItem value="Openers">Openers</SelectItem>
                  <SelectItem value="Clickers">Clickers</SelectItem>
                  <SelectItem value="Leads">Leads</SelectItem>
                  <SelectItem value="Mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ISP</Label>
              <Select value={isp} onValueChange={setIsp}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ISP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gmail">Gmail</SelectItem>
                  <SelectItem value="Yahoo">Yahoo</SelectItem>
                  <SelectItem value="Outlook">Outlook</SelectItem>
                  <SelectItem value="Hotmail">Hotmail</SelectItem>
                  <SelectItem value="AOL">AOL</SelectItem>
                  <SelectItem value="Mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Geo / Country</Label>
            <Select value={geo} onValueChange={setGeo}>
              <SelectTrigger>
                <SelectValue placeholder="Select Geo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States (US)</SelectItem>
                <SelectItem value="UK">United Kingdom (UK)</SelectItem>
                <SelectItem value="CA">Canada (CA)</SelectItem>
                <SelectItem value="AU">Australia (AU)</SelectItem>
                <SelectItem value="EU">Europe (EU)</SelectItem>
                <SelectItem value="T1">Tier 1</SelectItem>
                <SelectItem value="Mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">File Upload</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-indigo-500 transition-colors">
              <Input
                id="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="file" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium">
                  {file ? file.name : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports CSV (.csv) and Excel (.xlsx, .xls)
                </p>
              </label>
            </div>
          </div>

          {/* Preview Section */}
          {uploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700">Analyzing file and detecting email column...</span>
            </div>
          )}

          {previewData && !uploading && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle className="h-5 w-5" />
                Successfully detected {previewData.total} emails
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Detected Column:</span>
                  <Badge variant="outline" className="ml-2">{previewData.detected_column}</Badge>
                </div>
                <div>
                  <span className="text-gray-600">Total Rows:</span>
                  <span className="ml-2 font-medium">{previewData.total_rows}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-600 font-medium">Preview (first 10):</p>
                <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto">
                  {previewData.preview.map((email: string, idx: number) => (
                    <div key={idx} className="text-xs py-1 text-gray-700">{email}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!previewData || !listName || uploading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create List with {previewData?.total || 0} Emails
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
