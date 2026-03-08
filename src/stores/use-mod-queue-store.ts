import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AlertThresholdUnit = 'hours' | 'minutes';
type ModQueueViewMode = 'compact' | 'feed';

interface ModQueueState {
  alertThresholdValue: number;
  alertThresholdUnit: AlertThresholdUnit;
  selectedBoardFilter: string | null;
  viewMode: ModQueueViewMode;
  setAlertThreshold: (value: number, unit: AlertThresholdUnit) => void;
  setSelectedBoardFilter: (boardAddress: string | null) => void;
  setViewMode: (viewMode: ModQueueViewMode) => void;
  // Helper to get threshold in seconds for calculations
  getAlertThresholdSeconds: () => number;
}

// Type for old persisted state format (before migration)
interface OldPersistedState {
  alertThresholdHours?: number;
  alertThresholdValue?: number;
  alertThresholdUnit?: AlertThresholdUnit;
  selectedBoardFilter?: string | null;
  viewMode?: ModQueueViewMode;
}

// Type for persisted data (without methods)
type PersistedModQueueData = Pick<ModQueueState, 'alertThresholdValue' | 'alertThresholdUnit' | 'selectedBoardFilter' | 'viewMode'>;

const useModQueueStore = create<ModQueueState>()(
  persist(
    (set, get) => ({
      alertThresholdValue: 6,
      alertThresholdUnit: 'hours' as AlertThresholdUnit,
      selectedBoardFilter: null,
      viewMode: 'compact',
      setAlertThreshold: (value, unit) => set({ alertThresholdValue: value, alertThresholdUnit: unit }),
      setSelectedBoardFilter: (boardAddress) => set({ selectedBoardFilter: boardAddress }),
      setViewMode: (viewMode) => set({ viewMode }),
      getAlertThresholdSeconds: () => {
        const { alertThresholdValue, alertThresholdUnit } = get();
        return alertThresholdUnit === 'hours' ? alertThresholdValue * 3600 : alertThresholdValue * 60;
      },
    }),
    {
      name: 'mod-queue-storage',
      version: 2,
      // Migrate old alertThresholdHours format to new alertThresholdValue/alertThresholdUnit format
      migrate: (persistedState, version): ModQueueState => {
        const state = persistedState as OldPersistedState;
        if (version === 0 && state.alertThresholdHours !== undefined) {
          const migrated: PersistedModQueueData = {
            alertThresholdValue: state.alertThresholdHours,
            alertThresholdUnit: 'hours' as AlertThresholdUnit,
            selectedBoardFilter: state.selectedBoardFilter ?? null,
            viewMode: state.viewMode ?? 'compact',
          };
          // Zustand will merge this with the store definition (which includes methods)
          return migrated as ModQueueState;
        }
        // Ensure we return a valid persisted state shape
        const current: PersistedModQueueData = {
          alertThresholdValue: state.alertThresholdValue ?? 6,
          alertThresholdUnit: state.alertThresholdUnit ?? 'hours',
          selectedBoardFilter: state.selectedBoardFilter ?? null,
          viewMode: state.viewMode ?? 'compact',
        };
        return current as ModQueueState;
      },
    },
  ),
);

export default useModQueueStore;
