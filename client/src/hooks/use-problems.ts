import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProblem, type Problem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useProblems(sheetId: number) {
  return useQuery<Problem[]>({
    queryKey: [api.problems.list.path, sheetId],
    queryFn: async () => {
      const url = buildUrl(api.problems.list.path, { id: sheetId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch problems");
      const data = await res.json();
      return api.problems.list.responses[200].parse(data);
    },
    enabled: !!sheetId,
  });
}

export function useCreateProblem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sheetId, ...data }: InsertProblem) => {
      const url = buildUrl(api.problems.create.path, { id: sheetId });
      const res = await fetch(url, {
        method: api.problems.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add problem");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.problems.list.path, variables.sheetId] });
      // Also invalidate stats as counts changed
      queryClient.invalidateQueries({ queryKey: [api.stats.dashboard.path] });
      toast({
        title: "Problem added",
        description: "Added to your practice sheet.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateProblem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, sheetId, ...updates }: { id: number; sheetId: number } & Partial<InsertProblem>) => {
      const url = buildUrl(api.problems.update.path, { id });
      const res = await fetch(url, {
        method: api.problems.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update problem");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.problems.list.path, variables.sheetId] });
      queryClient.invalidateQueries({ queryKey: [api.stats.dashboard.path] });
      toast({
        title: "Updated",
        description: "Problem updated successfully.",
      });
    },
  });
}

export function useDeleteProblem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id }: { id: number; sheetId: number }) => {
      const url = buildUrl(api.problems.delete.path, { id });
      const res = await fetch(url, { method: api.problems.delete.method });
      if (!res.ok) throw new Error("Failed to delete problem");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.problems.list.path, variables.sheetId] });
      queryClient.invalidateQueries({ queryKey: [api.stats.dashboard.path] });
      toast({
        title: "Problem deleted",
      });
    },
  });
}
