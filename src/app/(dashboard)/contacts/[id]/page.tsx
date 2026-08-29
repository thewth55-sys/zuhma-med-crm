'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ContactDetailView } from '@/components/contacts/contact-detail-view';

/**
 * Ficha del paciente como PÁGINA aparte (antes era un popup). El detalle
 * vive en ContactDetailView, que ahora se renderiza embebido en la
 * página en vez de dentro de un Dialog. Deep-linkable con ?tab=.
 */
export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('Contacts.detailView');

  return (
    <div className="space-y-4">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('backToList')}
      </Link>
      <ContactDetailView contactId={id} />
    </div>
  );
}
