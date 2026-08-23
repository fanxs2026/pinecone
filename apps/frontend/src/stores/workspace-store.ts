import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkspaceState {
  selectedWorkspaceId: string | null;
  setSelectedWorkspace: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      selectedWorkspaceId: null,
      setSelectedWorkspace: (id) => set({ selectedWorkspaceId: id }),
    }),
    {
      name: 'pinecone-workspace',
      partialize: (state) => ({ selectedWorkspaceId: state.selectedWorkspaceId }),
    }
  )
);
