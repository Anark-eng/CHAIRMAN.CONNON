"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileLink } from "@/lib/data/profile";

export interface ProfileActionState {
  error?: string;
  message?: string;
}

const MAX_BIO_LENGTH = 800;
const MAX_LINKS = 5;
const MAX_LINK_LABEL = 40;

// Author-mode + pen name only. Public profile fields (avatar, bio,
// links) go through their own action so the two save paths can give
// their own visible confirmation without stomping on each other.
export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to log in first." };

  const authorModeOn = formData.get("is_author") === "on";
  const penName = String(formData.get("pen_name") ?? "").trim();

  if (authorModeOn && penName.length === 0) {
    return { error: "Enter a pen name to turn on Author Mode." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      is_author: authorModeOn,
      pen_name: penName.length > 0 ? penName : null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath(`/authors/${user.id}`);
  revalidatePath("/", "layout");
  return { message: "Profile saved." };
}

// Bio + links. Everything is plain text on the way in and out — no
// HTML stored, no HTML rendered. Links are validated as http(s).
export async function updatePublicProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to log in first." };

  const bioRaw = String(formData.get("bio") ?? "");
  const bio = bioRaw.trim();
  if (bio.length > MAX_BIO_LENGTH) {
    return { error: `Bio is too long — keep it under ${MAX_BIO_LENGTH} characters.` };
  }

  const links: ProfileLink[] = [];
  for (let i = 0; i < MAX_LINKS; i++) {
    const url = String(formData.get(`link_url_${i}`) ?? "").trim();
    const label = String(formData.get(`link_label_${i}`) ?? "").trim().slice(0, MAX_LINK_LABEL);
    if (!url) continue;
    if (!isSafeHttpUrl(url)) {
      return { error: `“${url}” isn’t a valid http(s) address.` };
    }
    links.push({ label: label || null, url });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ bio: bio.length > 0 ? bio : null, links })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath(`/authors/${user.id}`);
  return { message: "Public profile saved." };
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function updateAvatar(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to log in first." };

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "Pick a file to upload." };
  if (file.size > AVATAR_MAX_BYTES) {
    return { error: "That image is over 2 MB — pick a smaller one." };
  }
  if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
    return { error: "JPG, PNG, WEBP or GIF only." };
  }

  const ext = file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : file.type === "image/gif"
        ? "gif"
        : "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (uploadError) return { error: uploadError.message };

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  // Append the upload time so browsers refresh cached avatars.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (updErr) return { error: updErr.message };

  revalidatePath("/profile");
  revalidatePath(`/authors/${user.id}`);
  return { message: "Avatar updated." };
}

// Password change requires the current one — Supabase's updateUser
// itself doesn't ask, so we re-authenticate with signInWithPassword
// against the current user's email before applying the new password.
export async function changePassword(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "You need to log in first." };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  if (next.length < 8) {
    return { error: "Choose a new password that's at least 8 characters." };
  }

  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauthErr) return { error: "That current password didn’t match." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };

  return { message: "Password changed." };
}

// Email change asks Supabase to send a confirmation link. On this
// project only whitelisted addresses get real mail — the caller
// surfaces that caveat so we're honest about what will happen.
export async function changeEmail(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "You need to log in first." };

  const nextEmail = String(formData.get("new_email") ?? "").trim().toLowerCase();
  const current = String(formData.get("current_password") ?? "");
  if (!nextEmail.includes("@")) return { error: "Enter a valid email address." };
  if (nextEmail === user.email) return { error: "That's already your email." };

  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauthErr) return { error: "That current password didn’t match." };

  const { error } = await supabase.auth.updateUser({ email: nextEmail });
  if (error) return { error: error.message };

  return {
    message:
      "Confirmation email requested. It won't arrive unless the address is on this project's allowlist yet — see the note above.",
  };
}

// Data export: gather everything about this user into a JSON blob.
// Returns a base64-encoded string plus a filename hint so the caller
// (a client component) can hand it back as a download without a
// separate route.
export async function exportUserData(): Promise<
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to log in first." };

  const [
    { data: profileRow },
    { data: libraryRows },
    { data: progressRows },
    { data: ratingRows },
    { data: chapterCommentRows },
    { data: paragraphCommentRows },
    { data: novelRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("library_entries").select("*").eq("user_id", user.id),
    supabase.from("reading_progress").select("*").eq("user_id", user.id),
    supabase.from("novel_ratings").select("*").eq("user_id", user.id),
    supabase.from("chapter_comments").select("*").eq("user_id", user.id),
    supabase.from("paragraph_comments").select("*").eq("user_id", user.id),
    supabase.from("novels").select("*").eq("author_id", user.id),
  ]);

  const novelIds = (novelRows ?? []).map((n) => n.id);
  const { data: chapterRows } = novelIds.length > 0
    ? await supabase.from("chapters").select("*").in("novel_id", novelIds)
    : { data: [] };

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profileRow ?? null,
    library: libraryRows ?? [],
    reading_progress: progressRows ?? [],
    ratings: ratingRows ?? [],
    comments: {
      chapter: chapterCommentRows ?? [],
      paragraph: paragraphCommentRows ?? [],
    },
    novels: novelRows ?? [],
    chapters: chapterRows ?? [],
  };

  const json = JSON.stringify(payload, null, 2);
  const base64 = Buffer.from(json, "utf8").toString("base64");
  const filename = `noveltrend-export-${new Date().toISOString().slice(0, 10)}.json`;
  return { ok: true, base64, filename };
}

// Mark the account for deletion + record the choice. The reserved
// identity check + choice validation happen inside the DB function.
export async function requestAccountDeletion(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "You need to log in first." };

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }
  const current = String(formData.get("current_password") ?? "");
  const choice = String(formData.get("choice") ?? "");
  const validChoice = choice === "keep_work" || choice === "remove_work";
  if (!validChoice) return { error: "Choose what happens to your novels." };

  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauthErr) return { error: "That current password didn’t match." };

  const { error } = await supabase.rpc("soft_delete_account", { p_choice: choice });
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return { message: "Deletion scheduled." };
}

export async function cancelAccountDeletion(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to log in first." };

  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
