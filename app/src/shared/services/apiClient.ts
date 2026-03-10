import { setupAPIClient } from "./api";
import { signOut } from "../../context/AuthContext";

export const api = setupAPIClient(undefined, signOut);