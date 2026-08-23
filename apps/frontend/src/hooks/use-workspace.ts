import { useQuery } from '@tanstack/react-query';
import { workspaceApi, type Workspace } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function useWorkspace(): {
  workspace: Workspace | undefined;
  workspaceId: string | undefined;
  workspaces: Workspace[];
  isLoading: boolean;
  error: Error | null;
  switchWorkspace: (id: string) => void;
} {
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);
  const setSelectedWorkspace = useWorkspaceStore((s) => s.setSelectedWorkspace);

  const { data: workspaces = [], isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.list().then((r) => r.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Derive workspace from selected ID, falling back to first workspace
  const workspace =
    workspaces.find((ws) => ws.id === selectedWorkspaceId) ?? workspaces[0];

  return {
    workspace,
    workspaceId: workspace?.id,
    workspaces,
    isLoading,
    error: error as Error | null,
    switchWorkspace: setSelectedWorkspace,
  };
}
