// ============================================================
// Provider dispatch — picks the right transport (official Meta Cloud
// API vs. the unofficial QR/Baileys gateway) for an outbound send,
// based on which whatsapp_config row is resolved for the message.
//
// QR now supports text AND media (image/video/audio/document) — see
// qrSender's sendMedia below and services/wa-qr-gateway/src/sessions.ts.
// Templates and interactive buttons/lists still throw before ever
// reaching the gateway: Baileys has no equivalent to a Meta-approved
// template, and native WhatsApp buttons/lists are a separate, more
// involved piece of work than "give Baileys a link" media sends.
//
// This does NOT yet cover automations (src/lib/automations/meta-send.ts),
// flows (src/lib/flows/meta-send.ts), or broadcasts
// (src/lib/whatsapp/broadcast-core.ts) — those call Meta directly and
// get an explicit guard instead (Phase 2 converges them onto this
// dispatcher; see the plan for why that's deliberately deferred).
// ============================================================

import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  type MediaKind,
} from '@/lib/whatsapp/meta-api';
import type { MessageTemplate } from '@/types';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import { sendQrTextMessage, sendQrMediaMessage } from '@/lib/whatsapp/qr-gateway-client';
import type { InteractiveButton, InteractiveListSection } from '@/lib/whatsapp/interactive';

export type WhatsAppProvider = 'cloud_api' | 'qr';

/** The subset of whatsapp_config columns dispatch needs. Callers pass
 *  the full row; this is just the type contract. */
export interface WhatsAppConfigForSend {
  id: string;
  account_id: string;
  provider: WhatsAppProvider;
  phone_number_id: string | null;
}

export class UnsupportedOnProviderError extends Error {
  constructor(provider: WhatsAppProvider, what: string) {
    super(`${what} is not available over the "${provider}" connection yet.`);
    this.name = 'UnsupportedOnProviderError';
  }
}

interface SendTextArgs {
  to: string;
  text: string;
  contextMessageId?: string;
}
interface SendTemplateArgs {
  to: string;
  templateName: string;
  language?: string;
  template?: MessageTemplate;
  messageParams?: SendTimeParams;
  params?: string[];
  contextMessageId?: string;
}
interface SendMediaArgs {
  to: string;
  kind: MediaKind;
  link: string;
  caption?: string;
  filename?: string;
  contextMessageId?: string;
}
interface SendInteractiveButtonsArgs {
  to: string;
  bodyText: string;
  headerText?: string;
  footerText?: string;
  buttons: InteractiveButton[];
  contextMessageId?: string;
}
interface SendInteractiveListArgs {
  to: string;
  bodyText: string;
  buttonLabel: string;
  headerText?: string;
  footerText?: string;
  sections: InteractiveListSection[];
  contextMessageId?: string;
}

/** Minimal shape both providers implement. Optional members are the
 *  message kinds a provider doesn't support at all yet — dispatch()
 *  below throws UnsupportedOnProviderError before calling them, so
 *  their absence is enforced at the type level too. */
export interface WhatsAppSender {
  sendText(args: SendTextArgs): Promise<{ messageId: string }>;
  sendTemplate?(args: SendTemplateArgs): Promise<{ messageId: string }>;
  sendMedia?(args: SendMediaArgs): Promise<{ messageId: string }>;
  sendInteractiveButtons?(args: SendInteractiveButtonsArgs): Promise<{ messageId: string }>;
  sendInteractiveList?(args: SendInteractiveListArgs): Promise<{ messageId: string }>;
}

function cloudApiSender(config: WhatsAppConfigForSend, accessToken: string): WhatsAppSender {
  const phoneNumberId = config.phone_number_id!;
  return {
    async sendText(args) {
      return sendTextMessage({ phoneNumberId, accessToken, ...args });
    },
    async sendTemplate(args) {
      return sendTemplateMessage({ phoneNumberId, accessToken, ...args });
    },
    async sendMedia(args) {
      return sendMediaMessage({ phoneNumberId, accessToken, ...args });
    },
    async sendInteractiveButtons(args) {
      return sendInteractiveButtons({ phoneNumberId, accessToken, ...args });
    },
    async sendInteractiveList(args) {
      return sendInteractiveList({ phoneNumberId, accessToken, ...args });
    },
  };
}

function qrSender(config: WhatsAppConfigForSend): WhatsAppSender {
  return {
    async sendText(args) {
      return sendQrTextMessage({ accountId: config.account_id, to: args.to, text: args.text });
    },
    async sendMedia(args) {
      return sendQrMediaMessage({
        accountId: config.account_id,
        to: args.to,
        kind: args.kind,
        link: args.link,
        caption: args.caption,
        filename: args.filename,
      });
    },
    // No sendTemplate/sendInteractive* — Baileys has no equivalent to a
    // Meta-approved template, and native buttons/lists aren't wired up
    // yet. Leaving these undefined (rather than throwing inside them)
    // lets assertProviderSupports() below give a clearer, uniform error
    // before ever constructing a request.
  };
}

export function getSender(config: WhatsAppConfigForSend, accessToken: string): WhatsAppSender {
  return config.provider === 'qr' ? qrSender(config) : cloudApiSender(config, accessToken);
}

/** Type of outbound message being sent — mirrors the messageType
 *  values send-message.ts already works with. */
export type OutboundMessageKind =
  | 'text'
  | 'template'
  | 'interactive'
  | MediaKind;

/**
 * Throws UnsupportedOnProviderError up front when the resolved
 * provider can't handle this message kind at all, instead of letting
 * the caller find out via a missing-method crash deep in a retry loop.
 */
export function assertProviderSupports(
  provider: WhatsAppProvider,
  kind: OutboundMessageKind
): void {
  if (provider === 'cloud_api') return; // Cloud API supports everything send-message.ts already validates.
  // QR supports text and media (image/video/audio/document) — see
  // qrSender.sendMedia above. Only templates and interactive
  // buttons/lists have no QR equivalent.
  if (kind === 'template' || kind === 'interactive') {
    throw new UnsupportedOnProviderError(
      provider,
      kind === 'template' ? 'Plantillas de WhatsApp' : 'Mensajes interactivos (botones/listas)'
    );
  }
}
