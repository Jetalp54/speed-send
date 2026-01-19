'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { API_URL, apiClient } from '@/lib/api';

interface ContactList {
  id: string;
  name: string;
  contacts_count: number;
  contacts: any[];
}

interface ContactListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectList: (emails: string[]) => void;
}

export const ContactListModal: React.FC<ContactListModalProps> = ({ isOpen, onClose, onSelectList }) => {
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchContactLists = async () => {
        setError(null);
        try {
          const response = await apiClient.request('/api/v1/contacts/lists');
          if (response.error) throw new Error(response.error);
          const lists = (response.data || []).map((list: any) => ({
            ...list,
            contacts_count: list.contacts.length,
          }));
          setContactLists(lists);
        } catch (err) {
          setError('Failed to fetch contact lists.');
        }
      };
      fetchContactLists();
    }
  }, [isOpen]);

  const handleLoadList = async () => {
    if (!selectedList) {
      setError('Please select a list.');
      return;
    }
    try {
      // The full list data including contacts is already fetched.
      const emails = selectedList.contacts.map((c: any) => c.email);
      onSelectList(emails);
      onClose();
    } catch (err) {
      setError('Failed to load contacts from the selected list.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Load Recipients from Contact List</DialogTitle>
        </DialogHeader>
        {error && <p className="text-red-500">{error}</p>}
        <ScrollArea className="h-72">
          <div className="space-y-4">
            {contactLists.map((list) => (
              <div key={list.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`list-${list.id}`}
                    checked={selectedList?.id === list.id}
                    onCheckedChange={() => setSelectedList(list)}
                  />
                  <label htmlFor={`list-${list.id}`}>{list.name}</label>
                </div>
                <span className="text-sm text-muted-foreground">{list.contacts_count} contacts</span>
              </div>
            ))}
            {contactLists.length === 0 && !error && (
              <div className="text-center text-gray-500">No contact lists found.</div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleLoadList}>Load List</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
