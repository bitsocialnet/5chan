import { ComponentType, use } from 'react';
import { createTrackedImport } from '../../lib/tracked-import';

type SectionModule = { default: ComponentType };

export type SectionLoader = () => Promise<SectionModule>;

/**
 * Caches a settings section's dynamic import (see createTrackedImport), so a section whose chunk is
 * already loaded renders in the same commit as the click that expanded it.
 */
export const createSectionLoader = (load: () => Promise<SectionModule>): SectionLoader => createTrackedImport(load);

/** Renders a code split section, suspending only while its chunk is still loading. */
const LazySection = ({ load }: { load: SectionLoader }) => {
  const { default: Section } = use(load());
  return <Section />;
};

export default LazySection;
