import { redirect } from "react-router";

export function loader() {
  return redirect("/lessons/context-c10-contextual-retrieval");
}

export default function RedirectToC10() {
  return null;
}
