import { OLD_MAN_HEAD_PATHS } from './old-man-head-paths'

/**
 * The logo's old man, head and pipe only, as vector shapes traced from the logo itself so
 * his face matches it exactly at any size. He faces left; the shapes span about 10..170 x 8..128.
 */
export function OldManHead() {
  return (
    <g stroke="none">
      {OLD_MAN_HEAD_PATHS.map(([fill, d], i) => (
        <path key={i} d={d} fill={fill} />
      ))}
    </g>
  )
}
