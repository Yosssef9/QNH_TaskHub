declare module 'stylis' {
  export interface Element {
    value: string
    root: Element | null
    parent: Element | null
    children: Element[] | string
    type: string
    props: string[] | string
    return: string
    line: number
    column: number
    length: number
  }

  export type Middleware = (
    element: Element,
    index: number,
    children: Element[],
    callback: Middleware,
  ) => string | void

  export const prefixer: Middleware
}
