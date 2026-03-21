import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { type Contest } from "@shared/schema";

export function useContests(type?: string) {
  return useQuery<Contest[]>({
    queryKey: [api.contests.list.path, type],
    queryFn: async () => {
      const url = type ? `${api.contests.list.path}?type=${type}` : api.contests.list.path;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch contests");
      const data = await res.json();
      return api.contests.list.responses[200].parse(data);
    },
  });
}

export function useContest(id: number) {
  return useQuery({
    queryKey: [api.contests.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.contests.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch contest");
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useCreateContest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(api.contests.create.path, {
        method: api.contests.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create contest");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.contests.list.path] });
      toast({ title: "Success", description: "Contest created successfully" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });
}

export function useJoinContest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.contests.join.path, { id });
      const res = await fetch(url, { method: api.contests.join.method });
      if (!res.ok) throw new Error("Failed to join contest");
      return await res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.contests.get.path, id] });
      toast({ title: "Joined", description: "Successfully joined the contest" });
    },
  });
}

export function useSubmitContestProblem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contestId, problemId, status }: { contestId: number, problemId: number, status: string }) => {
      let url = api.contests.submit.path;
      url = url.replace(":id", String(contestId)).replace(":problemId", String(problemId));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Failed to submit");
      return await res.json();
    },
    onSuccess: (_, { contestId }) => {
      queryClient.invalidateQueries({ queryKey: [api.contests.get.path, contestId] });
      queryClient.invalidateQueries({ queryKey: [api.contests.leaderboard.path, contestId] });
    }
  });
}

export function useBlitzQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.contests.blitzQueue.path, { method: api.contests.blitzQueue.method });
      if (!res.ok) throw new Error("Failed to queue for Blitz");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.contests.list.path] });
      toast({ title: "Blitz Match Found", description: "You are now in a Blitz Match!" });
    },
    onError: (err) => {
      toast({ title: "Queue Failed", description: err.message, variant: "destructive" });
    }
  });
}

export function useContestLeaderboard(id: number) {
  return useQuery({
    queryKey: [api.contests.leaderboard.path, id],
    queryFn: async () => {
      const url = buildUrl(api.contests.leaderboard.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return await res.json();
    },
    enabled: !!id,
    refetchInterval: 5000, 
  });
}
