export function stripAddressNoise(s) {
  if (!s) return '';
  return s
    .split(/ этаж| оф| кв| каб| корп|строение| клиентский| вход| пом/i)[0] // Отрезаем по ключевым словам
    .replace(/[^а-яёa-z0-9\s.,-]/gi, '') // Удаляем спецсимволы
    .trim();
}

export async function cleanAddressDaData(address, region) {
  if (!process.env.DADATA_API_KEY || !address || address.length < 5) return null;

  const query = (region ? region + ', ' : '') + address;

  try {
    // Используем метод Подсказок (Suggestions API) - 10к в день бесплатно
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: query, count: 1 })
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`[DaData Error] Status: ${response.status} | ${err}`);
      return null;
    }

    const result = await response.json();
    if (result && result.suggestions && result.suggestions[0]) {
      const s = result.suggestions[0];
      return {
        lat: s.data.geo_lat,
        lon: s.data.geo_lon,
        address: s.value
      };
    }
  } catch (e) {
    console.error("DaData connection error:", e.message);
  }
  return null;
}
