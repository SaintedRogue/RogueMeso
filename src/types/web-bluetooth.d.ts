// Minimal Web Bluetooth ambient types — just the slice HeartRateProvider uses (the GATT
// Heart Rate service). Kept local instead of depending on @types/web-bluetooth: the API
// is Chromium-only and this surface is tiny and stable.

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(type: "characteristicvaluechanged", listener: (ev: Event) => void): void;
  removeEventListener(type: "characteristicvaluechanged", listener: (ev: Event) => void): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(name: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(name: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: "gattserverdisconnected", listener: (ev: Event) => void): void;
  removeEventListener(type: "gattserverdisconnected", listener: (ev: Event) => void): void;
}

interface Bluetooth {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BluetoothDevice>;
}

interface Navigator {
  /** Chromium only — feature-detect before use. */
  bluetooth?: Bluetooth;
}
