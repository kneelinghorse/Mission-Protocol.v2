import { z } from 'zod';
import { DomainNameSchema, FilePathSchema } from '../common';

const SemVerSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (X.Y.Z)');

export const DomainDependencySchema = z.object({
  name: DomainNameSchema,
  version: SemVerSchema,
});

export const DomainManifestSchema = z.object({
  name: DomainNameSchema,
  version: SemVerSchema,
  displayName: z.string().min(1).max(128),
  description: z.string().min(1).max(2000),
  author: z.string().min(1).max(128).optional(),
  schema: FilePathSchema,
  dependencies: z.array(DomainDependencySchema).max(32).optional(),
});

export const DomainTemplateSchema = z.record(z.string().min(1), z.unknown());

export const DomainPackSchema = z.object({
  manifest: DomainManifestSchema,
  schema: z.record(z.string(), z.unknown()),
  template: DomainTemplateSchema,
});

export type DomainManifest = z.infer<typeof DomainManifestSchema>;
export type DomainPack = z.infer<typeof DomainPackSchema>;

