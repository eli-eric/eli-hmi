export const ENV = process.env.NODE_ENV || 'development' // 'development', 'production', or 'test'

export const WS_URL = `ws://${process.env.NEXT_PUBLIC_API_URL}/ws/pvs`
export const API_URL = `http://${process.env.NEXT_PUBLIC_API_URL}/pv`
