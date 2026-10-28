import mongoose from "mongoose";
import Task from "../models/Task.js";
import Goal from "../models/Goal.js";
import { invalid, objectBody } from "../security.js";
import { validDate } from "../domain/calendar.js";
export function fields(body, allowed) {
  objectBody(body);
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    throw invalid("Unknown record field.");
  if (!Object.keys(body).length) throw invalid("No changes supplied.");
  return { ...body };
}
export function text(value, label, max, empty = false) {
  if (
    typeof value !== "string" ||
    (!empty && !value.trim()) ||
    value.length > max
  )
    throw invalid(label + " is invalid (maximum " + max + " characters).");
  return value.trim();
}
export function date(value, label = "Date") {
  if (!validDate(value))
    throw invalid(label + " must be a valid calendar date.");
  return value;
}
export function bool(value) {
  if (typeof value !== "boolean") throw invalid("Expected true or false.");
  return value;
}
export function choice(value, options) {
  if (!options.includes(value)) throw invalid("Invalid selection.");
  return value;
}
export function id(value) {
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value))
    throw invalid("Invalid reference ID.");
  return value;
}
export async function references(data, user) {
  for (const [key, Model] of [
    ["goalId", Goal],
    ["taskId", Task],
  ])
    if (data[key] !== undefined && data[key] !== null) {
      id(data[key]);
      if (!(await Model.exists({ _id: data[key], user })))
        throw invalid(
          "Linked record is unavailable or belongs to another account.",
        );
    }
  if (data.taskIds !== undefined) {
    if (!Array.isArray(data.taskIds) || data.taskIds.length > 100)
      throw invalid("Link at most 100 tasks.");
    data.taskIds.forEach(id);
    if (new Set(data.taskIds).size !== data.taskIds.length)
      throw invalid("Duplicate task links.");
    if (
      (await Task.countDocuments({ _id: { $in: data.taskIds }, user })) !==
      data.taskIds.length
    )
      throw invalid("One or more linked tasks are unavailable.");
  }
}
export async function owned(Model, recordId, user) {
  id(recordId);
  const doc = await Model.findOne({ _id: recordId, user });
  if (!doc)
    throw Object.assign(new Error("Record not found."), { status: 404 });
  return doc;
}
export function searchQuery(query, keys) {
  const result = {};
  if (query.search !== undefined) {
    const search = text(query.search, "Search", 120, true).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    result.$or = keys.map((key) => ({
      [key]: { $regex: search, $options: "i" },
    }));
  }
  if (query.category !== undefined)
    result.category = text(query.category, "Category", 60);
  return result;
}
export const base = (doc) => ({
  id: doc.id,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});
