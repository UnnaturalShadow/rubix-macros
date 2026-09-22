import type { CubeAPI } from "../shared/api";
declare global {
  interface Window { cubeAPI?: CubeAPI }
}
