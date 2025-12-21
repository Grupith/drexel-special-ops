import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, updateUserPreferences } from "@/lib/firebase/users";
import { UserProfile } from "@/types";

export function useUserProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["userProfile", user?.uid],
    queryFn: () => {
      if (!user?.uid) return null;
      return getUserProfile(user.uid);
    },
    enabled: !!user?.uid,
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (preferences: Partial<UserProfile["preferences"]>) => {
      if (!user?.uid) throw new Error("User not authenticated");
      return updateUserPreferences(user.uid, preferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
  });
}
