import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertSheet, type Sheet } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useSheets() {
  return useQuery<Sheet[]>({
    queryKey: [api.sheets.list.path],
    queryFn: async () => {
      const res = await fetch(api.sheets.list.path);
      if (!res.ok) throw new Error("Failed to fetch sheets");
      const data = await res.json();
      return api.sheets.list.responses[200].parse(data);
    },
  });
}

export function useSheet(id: number) {
  return useQuery<Sheet>({
    queryKey: [api.sheets.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.sheets.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch sheet");
      const data = await res.json();
      return api.sheets.get.responses[200].parse(data);
    },
    enabled: !!id,
  });
}

export function useCreateSheet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertSheet) => {
      const res = await fetch(api.sheets.create.path, {
        method: api.sheets.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create sheet");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sheets.list.path] });
      toast({
        title: "Sheet created",
        description: "Your new practice sheet is ready.",
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

export function useDeleteSheet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.sheets.delete.path, { id });
      const res = await fetch(url, { method: api.sheets.delete.method });
      if (!res.ok) throw new Error("Failed to delete sheet");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sheets.list.path] });
      toast({
        title: "Sheet deleted",
        description: "The practice sheet has been removed.",
      });
    },
  });
}
