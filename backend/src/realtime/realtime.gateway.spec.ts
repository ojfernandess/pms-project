import { ConfigService } from "@nestjs/config";
import { Socket } from "socket.io";
import { RealtimeGateway } from "./realtime.gateway";

function gatewayWith(token: string) {
  return new RealtimeGateway({
    get: (key: string) => (key === "SOCKET_AUTH_TOKEN" ? token : ""),
  } as ConfigService);
}

function socketWith(token?: string): Socket {
  return {
    id: "sock-1",
    handshake: { auth: token ? { token } : {}, headers: {} },
    disconnect: jest.fn(),
    emit: jest.fn(),
  } as unknown as Socket;
}

describe("RealtimeGateway", () => {
  it("disconnects clients without the configured token", () => {
    const client = socketWith();
    gatewayWith("secret").handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).not.toHaveBeenCalled();
  });

  it("rejects every client when no token is configured", () => {
    const client = socketWith("anything");
    gatewayWith("").handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("emits system.connected for a valid token", () => {
    const client = socketWith("secret");
    gatewayWith("secret").handleConnection(client);
    expect(client.emit).toHaveBeenCalledWith("system.connected", { ok: true });
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
