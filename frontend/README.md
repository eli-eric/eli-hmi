# ELI Beamlines Control System GUI

This project is a [Next.js](https://nextjs.org) application designed for **control system operators** and **control system engineers** at ELI Beamlines. It provides a user-friendly interface for operators and an easy-to-setup GUI framework for engineers who may not be React developers.

---

## Getting Started

### 1. Run the Development Server

To start the application locally, run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## Environment Variables Setup

Before running the application, you need to set up your environment variables.  
Create a file named `.env.local` in the root of the project (next to `package.json`) and add the following content:

```env
NEXTAUTH_SECRET=your_secret_key_here
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8080/ws/pvs
```

- **NEXTAUTH_SECRET**: Secret key for NextAuth authentication (use a strong, random value in production).
- **NEXT_PUBLIC_WEBSOCKET_URL**: The WebSocket endpoint for your backend.

You can use the provided `env.example` file as a template:

```bash
cp env.example .env.local
```

Then edit `.env.local` and fill in your actual values.

---

## How to Set Up a GUI for Operators

This application uses a **compound component pattern** to make it easy for engineers to set up GUIs without needing deep React knowledge. Below is a step-by-step guide:

### 1. Understand the Compound Component Pattern

The compound component pattern allows you to compose complex UI components by combining smaller, reusable components. For example, the `VolumePanel` component is a container that can include titles, labels, cards, and connected WebSocket data components.

#### Example: Setting Up a Volume Panel

```tsx
import { VolumePanel } from '@/components/ws-components/volume-panel'

export const ExamplePanel = () => {
  return (
    <VolumePanel>
      <VolumePanel.Title label="Example Panel" />
      <VolumePanel.Label label="System Status" />
      <VolumePanel.Card>
        <VolumePanel.CardLabel>Pressure</VolumePanel.CardLabel>
        <VolumePanel.SensorPressureConnected
          pvname="AI_PRESSURE_SENSOR"
          label="Pressure Sensor"
        />
      </VolumePanel.Card>
    </VolumePanel>
  )
}
```

### 2. Use Pre-Built Components

The application provides pre-built components for common control system elements like:

- **Pressure Sensors**: `SensorPressureConnected`
- **Valve Status**: `ValveStatusConnected`
- **Pump Speed**: `PumpSpeed`
- **Interlocks**: `Interlocks`

These components are already connected to the WebSocket system and can be used directly in your pages.

---

## How WebSocket Connection Works

The application uses a WebSocket connection to communicate with the control system backend. This is managed by the `WebSocketProvider` and `useWebSocket` hook.

### Key Components:

1. **WebSocketProvider**  
   The `WebSocketProvider` is a React context provider that wraps the application and provides WebSocket connection state and methods to all components.

   - **File**: [`src/app/providers/socket-provider.tsx`](src/app/providers/socket-provider.tsx)
   - **Usage**:

     ```tsx
     import { WebSocketProvider } from '@/app/providers/socket-provider'
     ;<WebSocketProvider url="ws://localhost:8080/ws/pvs">
       <YourComponent />
     </WebSocketProvider>
     ```

   - **How It Works**:
     - The `WebSocketProvider` uses the `useWebSocket` hook to manage the WebSocket connection.
     - It provides the WebSocket state and methods (e.g., `send`, `subscribe`) to all child components via React context.

2. **useWebSocket Hook**  
   The `useWebSocket` hook handles the WebSocket connection logic, including reconnection, subscriptions, and message handling.

   - **File**: [`src/lib/websocket-provider/useWebsocket.tsx`](src/lib/websocket-provider/useWebsocket.tsx)
   - **Features**:

     - Automatic reconnection with exponential backoff and jitter.
     - Subscription management for specific channels.
     - Sending and receiving messages.

   - **Example Usage**:

     ```tsx
     import { useWebSocketContext } from '@/app/providers/socket-provider'

     const MyComponent = () => {
       const { send, subscribe, isConnected, status } = useWebSocketContext()

       // Subscribe to a channel
       useEffect(() => {
         const unsubscribe = subscribe('CHANNEL_NAME', (message) => {
           console.log('Received message:', message)
         })

         return () => unsubscribe()
       }, [subscribe])

       // Send a message
       const sendMessage = () => {
         if (isConnected) {
           send({ type: 'example', data: 'Hello, WebSocket!' })
         }
       }

       return (
         <div>
           <p>Connection Status: {status}</p>
           <button onClick={sendMessage}>Send Message</button>
         </div>
       )
     }
     ```

3. **WebSocket Context**  
   The `WebSocketContext` is a React context that provides WebSocket state and methods to components.

   - **File**: [`src/app/providers/socket-provider.tsx`](src/app/providers/socket-provider.tsx)
   - **How to Access**:
     Use the `useWebSocketContext` hook to access the context:

     ```tsx
     import { useWebSocketContext } from '@/app/providers/socket-provider'

     const { send, subscribe, isConnected, status } = useWebSocketContext()
     ```

---

## Missing Components or Issues?

If you encounter any missing components or issues while setting up the GUI or WebSocket logic, please contact the **support team** for assistance. Provide the following details when reaching out:

1. The component or feature you are trying to use.
2. Any error messages or unexpected behavior.
3. Steps to reproduce the issue.

---

## Summary for Engineers

1. **Use the Compound Component Pattern**: Combine pre-built components to create GUIs without writing complex React code.
2. **Leverage WebSocketProvider**: Automatically manage WebSocket connections and subscriptions.
3. **Focus on Business Logic**: Use the provided hooks and components to focus on control system logic, not React internals.

For more details, refer to the code in:

- `src/app/providers/socket-provider.tsx`
- `src/lib/websocket-provider/useWebsocket.tsx`
