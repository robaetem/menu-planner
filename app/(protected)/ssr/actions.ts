"use server";

import { createServerSupabaseClient } from "./client";

export async function addTask(name: string) {
  try {
    // Create the client inside the action so it captures the current request's Clerk token
    const client = createServerSupabaseClient();
    const response = await client.from("tasks").insert({
      name,
    });

    console.log("Task successfully added!", response);
  } catch (error: any) {
    console.error("Error adding task:", error.message);
    throw new Error("Failed to add task");
  }
}
