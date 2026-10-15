import { z } from 'zod';

const required = z.string().trim().min(2).max(2000);
export const legalSchema = z
  .object({
    publisher: required,
    legalForm: required,
    address: required,
    registration: required,
    director: required,
    supportEmail: z.email(),
    privacyEmail: z.email(),
    taxStatement: required,
    mediator: required,
    mediatorUrl: z.url().refine((url) => url.startsWith('https://')),
    mediatorAddress: required,
    withdrawalAddress: required,
    hostingDetails: required,
    processingLocations: required,
    internationalTransfers: required,
    retentionPolicy: required,
    termsVersion: required,
    privacyVersion: required,
    reviewed: z.literal(true),
  })
  .strict();
export type LegalConfig = z.infer<typeof legalSchema>;
export function readLegalConfig(): LegalConfig | undefined {
  try {
    return legalSchema.parse(JSON.parse(process.env.LEGAL_PUBLIC_CONFIG || 'null'));
  } catch {
    return undefined;
  }
}
