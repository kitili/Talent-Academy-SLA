// Based on blueprint:javascript_auth_all_persistance
import { createContext, ReactNode, useContext, useEffect } from "react";
import posthog from "posthog-js";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { clearSessionUser, persistSessionUser, readSessionUser } from "../lib/sessionUser";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean; // true until the server has answered /api/user
  error: Error | null;
  isAdmin: boolean;
  isTrainer: boolean;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  // The server decides who is signed in, on every load. The stored user is a placeholder while that request runs:
  // it is never cached as the answer, so nothing redirects on it.
  const {
    data: user,
    error,
    isSuccess,
    isPlaceholderData,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    placeholderData: () => readSessionUser(),
    staleTime: 0,
  });
  const answered = isSuccess && !isPlaceholderData;

  useEffect(() => {
    if (answered) persistSessionUser(user);
  }, [answered, user]);

  // A page restored from the back-forward cache did not load again, so ask the server again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Identify user in PostHog when user data is available
  useEffect(() => {
    if (user) {
      posthog.identify(user.id.toString(), {
        email: user.email,
        username: user.username,
        role: user.role,
        teacherId: (user as any).teacherId,
      });
    } else {
      posthog.reset();
    }
  }, [user]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      persistSessionUser(user);
      posthog.capture("user_login", {
        role: user.role,
        email: user.email
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      posthog.capture("user_registration", {
        role: user.role,
        email: user.email
      });
      toast({
        title: "Registration Submitted",
        description: "Your trainer account has been created and is pending admin approval.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    // One request ends the whole session, whoever is in it; the reload below waits for it.
    mutationFn: async () => {
      await fetch("/api/logout", { method: "POST", credentials: "include", signal: AbortSignal.timeout(4000) });
    },
    onSettled: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.setQueryData(["/api/teacher/me"], null);
      queryClient.removeQueries({ queryKey: ["/api/user"] });
      clearSessionUser();
      posthog.capture("user_logout");
      posthog.reset();
      window.location.replace("/auth");
    },
  });

  const isAdmin = user?.role === "admin";
  const isTrainer = user?.role === "trainer" || user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: !answered,
        error,
        isAdmin,
        isTrainer,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
