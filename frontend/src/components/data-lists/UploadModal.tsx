'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { X } from 'lucide-react';

// Define the props for the component
interface UploadModalProps {
  onClose: () => void;
  onUpload: (file: File, listName: string) => void;
}

export function UploadModal({ onClose, onUpload }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [listName, setListName] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (file && listName) {
      onUpload(file, listName);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upload New Data List</CardTitle>
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
          <div className="space-y-2">
            <Label htmlFor="file">CSV File</Label>
            <Input id="file" type="file" accept=".csv" onChange={handleFileChange} />
            <p className="text-sm text-muted-foreground">Upload a CSV file with an &apos;email&apos; column.</p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!file || !listName}>
            Upload and Create List
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
