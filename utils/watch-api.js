import Profile from './config/profile'

const send = (page, method, extra = {}) =>
  page.request({ method, request: { ...Profile.createRequestData(), ...extra } })

export const WatchApi = {
  linkStart:   (page)         => send(page, 'LINK_START'),
  linkStatus:  (page)         => send(page, 'LINK_STATUS'),
  linkConfirm: (page, wallet) => send(page, 'LINK_CONFIRM', { wallet }),
  linkReject:  (page)         => send(page, 'LINK_REJECT'),
  // сюда же со временем: getMandala, getNews, getCollection
}