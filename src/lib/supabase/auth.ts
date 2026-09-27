import { getSupabaseClient } from "./client";

export async function getAuthenticatedUser() {
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;

  // getUser validates the token with Supabase Auth before the app reads data.
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
