'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface SendTestEmailProps {
  onSend: (recipientEmail: string) => Promise<void>;
  disabled?: boolean;
}

export function SendTestEmail({ onSend, disabled }: SendTestEmailProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!recipientEmail) return;
    setIsSending(true);
    try {
      await onSend(recipientEmail);
      setIsModalOpen(false);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start gap-3"
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
      >
        <Send className="h-5 w-5" />
        <span>Send Test Email</span>
      </Button>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Send Test Email">
        <div className="space-y-4">
          <p className="text-gray-600">Enter the recipient&apos;s email address to send a test email.</p>
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={isSending || !recipientEmail}>
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
