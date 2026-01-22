'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Define the props for the component
interface UploadModalProps {
  onClose: () => void;
  onUpload: (file: File, listName: string, metadata: { type: string, isp: string, geo: string }) => void;
}

export function UploadModal({ onClose, onUpload }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [listName, setListName] = useState('');

  // New Metadata State
  const [listType, setListType] = useState('Fresh');
  const [isp, setIsp] = useState('Mixed');
  const [geo, setGeo] = useState('Mixed');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (file && listName) {
      onUpload(file, listName, { type: listType, isp, geo });
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
