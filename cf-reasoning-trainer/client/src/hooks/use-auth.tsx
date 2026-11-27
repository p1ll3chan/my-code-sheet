import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authResultSchema, publicUserSchema, type PublicUser, type RegisterInput, type LoginInput } from "@shared/contracts";
import { apiRequest, ApiError, resetSessionCache, setCsrfToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function useAuthState() {
  const client = useQueryClient();
  const { toast } = useToast();
  const current = useQuery<PublicUser | null>({ queryKey: ["/api/user"], queryFn: async ({ signal }) => {
    try { return publicUserSchema.parse(await (await apiRequest("GET", "/api/user", undefined, signal)).json()); }
    catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
  } });
  const notifyTabs = () => {
    if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("cf-session"); channel.postMessage("changed"); channel.close(); }
  };
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("cf-session");
    channel.onmessage = async () => { setCsrfToken(); await resetSessionCache(client, null); await client.invalidateQueries({ queryKey: ["/api/user"] }); };
    return () => channel.close();
  }, [client]);
  useEffect(() => {
    const expired = () => { setCsrfToken(); void resetSessionCache(client, null); };
    window.addEventListener("cf-session-expired", expired);
    return () => window.removeEventListener("cf-session-expired", expired);
  }, [client]);
  useEffect(() => {
    if (current.data === null) {
      void client.cancelQueries({ predicate: query => query.queryKey[0] !== "/api/user" }).then(() => {
        client.removeQueries({ predicate: query => query.queryKey[0] !== "/api/user" });
      });
    }
  }, [current.data, client]);
  const onError = (error: Error) => toast({ title: "Request failed", description: error.message, variant: "destructive" });
  const authenticate = async (path: string, input: RegisterInput | LoginInput) => authResultSchema.parse(await (await apiRequest("POST", path, input)).json());
  const onSuccess = async (result: ReturnType<typeof authResultSchema.parse>) => {
    setCsrfToken(result.csrfToken); await resetSessionCache(client, result.user); notifyTabs();
  };
  const loginMutation = useMutation({ mutationFn: (input: LoginInput) => authenticate("/api/login", input), onSuccess, onError });
  const registerMutation = useMutation({ mutationFn: (input: RegisterInput) => authenticate("/api/register", input), onSuccess, onError });
  const logoutMutation = useMutation({ mutationFn: async () => { await apiRequest("POST", "/api/logout"); },
    onSuccess: async () => { setCsrfToken(); await resetSessionCache(client, null); notifyTabs(); }, onError,
  });
  return { user: current.data ?? null, isLoading: current.isLoading, error: current.error, retry: current.refetch, loginMutation, registerMutation, logoutMutation };
}
const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) { const value = useAuthState(); return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>; }
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used within AuthProvider"); return value; }
