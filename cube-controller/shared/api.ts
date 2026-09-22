import type { OSAction } from "./actions";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CubePlatform = "darwin" | "win32" | "unsupported";
export type BluetoothDevice = { deviceId: string; deviceName: string };
export type PairingRequest = { deviceId: string; pairingKind: string; pin?: string };
export type PairingResponse = { confirmed: boolean; pin?: string };
export interface CubeAPI {
  readonly platform: CubePlatform;
  executeAction(action: OSAction): Promise<ActionResult>;
  selectBluetoothDevice(deviceId: string): Promise<void>;
  respondToPairing(response: PairingResponse): Promise<void>;
  onBluetoothDevices(callback: (devices: BluetoothDevice[]) => void): () => void;
  onBluetoothClosed(callback: () => void): () => void;
  onPairingRequest(callback: (request: PairingRequest) => void): () => void;
}
