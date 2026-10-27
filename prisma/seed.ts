/**
 * Demo data for development: categories, salons around Paris, services, offers and a demo user.
 * Run with: npm run db:seed   (also runs automatically after `prisma migrate reset`)
 *
 * Images use picsum.photos placeholders - replace with real salon photos later.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/common/utils/crypto.util';
import { addDays, zonedDateString, zonedToUtc } from '../src/common/utils/time.util';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type L = { en: string; fr: string; de: string };

const categories: { key: string; icon: string; name: L }[] = [
  { key: 'mens_haircut', icon: 'content_cut', name: { en: "Men's haircut", fr: 'Coupe pour hommes', de: 'Herrenhaarschnitt' } },
  { key: 'mens_shave', icon: 'face', name: { en: "Men's shave", fr: 'Rasage pour hommes', de: 'Herrenrasur' } },
  { key: 'kids', icon: 'child_care', name: { en: 'Kids', fr: 'Pour enfants', de: 'Für Kinder' } },
  { key: 'womens_haircut', icon: 'woman', name: { en: "Women's haircut", fr: 'Coupe pour femmes', de: 'Damenhaarschnitt' } },
  { key: 'waxing', icon: 'auto_awesome', name: { en: 'Waxing', fr: 'Épilation à la cire', de: 'Waxing' } },
  { key: 'facial', icon: 'spa', name: { en: 'Facial care', fr: 'Soins du visage', de: 'Gesichtspflege' } },
  { key: 'coloring', icon: 'palette', name: { en: 'Coloring', fr: 'Coloration', de: 'Färben' } },
  { key: 'nails', icon: 'back_hand', name: { en: 'Nails', fr: 'Ongles', de: 'Nägel' } },
  { key: 'henna', icon: 'brush', name: { en: 'Henna', fr: 'Henné', de: 'Henna' } },
];

// cents = EUR price in cents, pkr = price in rupees (used when the region's currency is PKR)
const serviceTemplates: Record<string, { name: L; minutes: number; cents: number; pkr: number }[]> = {
  mens_haircut: [
    { name: { en: 'Basic haircut', fr: 'Coupe de cheveux de base', de: 'Einfacher Haarschnitt' }, minutes: 30, cents: 2000, pkr: 1000 },
    { name: { en: 'Haircut & styling', fr: 'Coupe et coiffage', de: 'Haarschnitt & Styling' }, minutes: 45, cents: 3000, pkr: 1800 },
  ],
  mens_shave: [{ name: { en: 'Beard trim', fr: 'Taille de barbe', de: 'Bartschnitt' }, minutes: 20, cents: 1500, pkr: 600 }],
  kids: [{ name: { en: 'Kids haircut', fr: 'Coupe pour enfants', de: 'Kinderhaarschnitt' }, minutes: 25, cents: 1500, pkr: 800 }],
  womens_haircut: [{ name: { en: "Women's cut & blow-dry", fr: 'Coupe et brushing', de: 'Schnitt & Föhnen' }, minutes: 60, cents: 4500, pkr: 3000 }],
  waxing: [{ name: { en: 'Leg waxing', fr: 'Épilation des jambes', de: 'Beinwaxing' }, minutes: 40, cents: 3500, pkr: 2500 }],
  facial: [{ name: { en: 'Facial treatment', fr: 'Soin du visage', de: 'Gesichtsbehandlung' }, minutes: 45, cents: 4000, pkr: 3500 }],
  coloring: [{ name: { en: 'Hair coloring', fr: 'Coloration des cheveux', de: 'Haarfärbung' }, minutes: 90, cents: 6000, pkr: 6000 }],
  nails: [{ name: { en: 'Manicure', fr: 'Manucure', de: 'Maniküre' }, minutes: 40, cents: 2500, pkr: 2000 }],
  henna: [{ name: { en: 'Henna design', fr: 'Dessin au henné', de: 'Henna-Design' }, minutes: 45, cents: 3000, pkr: 2500 }],
};

type SeedSalon = {
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  cats: string[];
  home: boolean;
  phone?: string;
  website?: string;
  /** [open, close] in minutes after midnight, every day. Default 11:00-21:00. */
  hours?: [number, number];
};

type Region = { country: string; currency: string; timezone: string; salons: SeedSalon[] };

/**
 * Salons in Islamabad & Rawalpindi (names, addresses and phones from their public listings).
 * Map pins are approximate. Ratings and reviews in this app are DEMO data, not the real ones:
 * replace this list with salons that actually signed up before going live.
 */
const islamabad: Region = {
  country: 'PK',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  salons: [
    { name: 'House of Salons', city: 'Islamabad', address: '2nd Floor, City Centre, F-7 Markaz', lat: 33.7206, lng: 73.0567, cats: ['mens_haircut', 'mens_shave', 'facial'], home: false, phone: '+92 319 0155026', website: 'https://houseofsalons.pk' },
    { name: 'Jugnu Salon', city: 'Islamabad', address: 'Street 94, I-8/4', lat: 33.6680, lng: 73.0750, cats: ['womens_haircut', 'coloring', 'henna'], home: true },
    { name: 'Emkaez Makeup Studio & Salon', city: 'Islamabad', address: '1st Floor, Plaza 2, A Street 1, Pakeeza Market, near I-8 Markaz', lat: 33.6705, lng: 73.0790, cats: ['facial', 'womens_haircut', 'henna', 'nails'], home: true },
    { name: 'Royli Salon', city: 'Islamabad', address: 'F-6 Super Market', lat: 33.7282, lng: 73.0763, cats: ['womens_haircut', 'coloring', 'facial', 'waxing'], home: false, phone: '051-8744888', website: 'https://royli.com' },
    { name: 'Royli Salon F-10', city: 'Islamabad', address: 'F-10/2 Idrees Market', lat: 33.6947, lng: 73.0128, cats: ['womens_haircut', 'facial', 'waxing'], home: false, phone: '051-8744888', website: 'https://royli.com' },
    // From the Google Maps list/map of Islamabad salons (names, and the address/hours where shown).
    // Pins are placed at the sector shown on the map (±200 m): confirm with each salon.
    { name: 'Mediha Beauty Lounge Salon E-11 (Women only)', city: 'Islamabad', address: 'Ground Floor, Shop #2, E-11 Markaz', lat: 33.6975, lng: 72.9760, cats: ['womens_haircut', 'facial', 'waxing', 'nails', 'henna'], home: false, hours: [0, 24 * 60] },
    { name: 'Unique Beauty Salon', city: 'Islamabad', address: 'G-9/3, near G-9 Markaz', lat: 33.6905, lng: 73.0315, cats: ['womens_haircut', 'facial', 'henna'], home: false },
    { name: 'Serene & Revive Spa', city: 'Islamabad', address: 'G-8, near PIMS Hospital', lat: 33.6995, lng: 73.0505, cats: ['facial', 'waxing'], home: false },
    { name: 'Velvet Tresses Hair & Beauty Studio', city: 'Islamabad', address: 'I-8 Markaz', lat: 33.6693, lng: 73.0765, cats: ['womens_haircut', 'coloring', 'facial'], home: false },
    { name: 'Nordic Beauty Salon & Skincare', city: 'Islamabad', address: 'I-8, near Faizabad', lat: 33.6672, lng: 73.0800, cats: ['facial', 'womens_haircut', 'nails'], home: false },
    { name: 'Moshaz Beauty Salon Chaklala', city: 'Rawalpindi', address: 'House #170, Street 9, Chaklala Scheme 3', lat: 33.5905, lng: 73.0875, cats: ['womens_haircut', 'facial', 'waxing', 'nails'], home: true, phone: '051-8313555' },
    { name: 'Moshaz Beauty Salon Bahria Town', city: 'Rawalpindi', address: '1st Floor, Al-Masoom Complex, Civic Center, Bahria Town Phase 4', lat: 33.5257, lng: 73.0995, cats: ['womens_haircut', 'facial', 'nails'], home: false },
    { name: 'Stylish Beauty Salon By Azra', city: 'Rawalpindi', address: 'House No. 353, D Block, 6th Road, Satellite Town', lat: 33.6382, lng: 73.0651, cats: ['womens_haircut', 'henna', 'facial'], home: true, phone: '+92 337 5631417' },
    { name: 'Creation Salon And Academy', city: 'Rawalpindi', address: 'B-688, opposite Rabiaz Zone, B-Block, Satellite Town', lat: 33.6402, lng: 73.0702, cats: ['womens_haircut', 'coloring', 'nails'], home: false, phone: '+92 335 0010800' },
    { name: 'Lush Beauty Salon', city: 'Rawalpindi', address: 'Commercial Market Rd, B-Block, Satellite Town', lat: 33.6338, lng: 73.0722, cats: ['womens_haircut', 'facial', 'waxing'], home: false, phone: '+92 333 5677334' },
    { name: 'World Style Saloon', city: 'Rawalpindi', address: 'B-Block, Satellite Town (Men & Women, 24 hours)', lat: 33.6412, lng: 73.0683, cats: ['mens_haircut', 'mens_shave', 'womens_haircut', 'kids'], home: false, hours: [0, 24 * 60] },

    // From the Google Maps view around Satellite Town / Ali Abad / Muslim Town (names only).
    // Addresses are the area, pins are placed from the map screenshot (±150 m): confirm with each salon.
    { name: 'Capri Salon & Studios', city: 'Rawalpindi', address: 'Near Murree Road, Satellite Town', lat: 33.6477, lng: 73.0827, cats: ['womens_haircut', 'coloring', 'facial', 'nails'], home: false },
    { name: 'Daneen Beauty Salon (Janat Naeem)', city: 'Rawalpindi', address: 'Near Murree Road, Satellite Town', lat: 33.6479, lng: 73.0836, cats: ['womens_haircut', 'facial', 'henna', 'waxing'], home: true },
    { name: 'Vibe and Glow Beauty Salon', city: 'Rawalpindi', address: 'Satellite Town', lat: 33.6446, lng: 73.0757, cats: ['facial', 'womens_haircut', 'nails', 'waxing'], home: false },
    { name: "Maheen's Beauty Parlour", city: 'Rawalpindi', address: 'Satellite Town', lat: 33.6421, lng: 73.0730, cats: ['womens_haircut', 'facial', 'henna'], home: true },
    { name: 'Alsana Beauty Salon', city: 'Rawalpindi', address: 'Satellite Town, near Asghar Mall Scheme', lat: 33.6431, lng: 73.0678, cats: ['womens_haircut', 'facial', 'waxing', 'nails'], home: false },
    { name: 'Jaynaan Beauty Saloon', city: 'Rawalpindi', address: 'Satellite Town, near 4th Road', lat: 33.6378, lng: 73.0728, cats: ['womens_haircut', 'facial', 'henna'], home: false },
    { name: 'Pretty Beauty Salon', city: 'Rawalpindi', address: 'Ali Abad, near Kurri Road', lat: 33.6380, lng: 73.0869, cats: ['womens_haircut', 'facial', 'waxing', 'henna'], home: true },
  ],
};

/** The first demo set (fictional salons around Paris), kept for European testing: SEED_REGION=paris */
const paris: Region = {
  country: 'FR',
  currency: 'EUR',
  timezone: 'Europe/Paris',
  salons: [
    { name: 'Masterpiece Barbershop', city: 'Paris', address: '12 Rue de Rivoli', lat: 48.8559, lng: 2.3601, cats: ['mens_haircut', 'mens_shave', 'facial'], home: false },
    { name: 'Jessica Miller Studio', city: 'Paris', address: '45 Rue du Faubourg Saint-Antoine', lat: 48.8521, lng: 2.3735, cats: ['womens_haircut', 'coloring', 'facial'], home: true },
    { name: 'James Thomas Barber', city: 'Paris', address: '8 Boulevard de Clichy', lat: 48.8822, lng: 2.3360, cats: ['mens_haircut', 'mens_shave', 'kids'], home: false },
    { name: 'Emily Johnson Beauty', city: 'Paris', address: '27 Avenue de l’Opéra', lat: 48.8683, lng: 2.3330, cats: ['waxing', 'facial', 'nails'], home: true },
    { name: 'Emma Moore Coiffure', city: 'Paris', address: '3 Rue Mouffetard', lat: 48.8430, lng: 2.3497, cats: ['womens_haircut', 'kids', 'coloring'], home: false },
    { name: 'Twinsky Monkey Barber', city: 'Paris', address: '61 Rue Oberkampf', lat: 48.8656, lng: 2.3780, cats: ['mens_haircut', 'mens_shave'], home: false },
    { name: 'Salon Woodlands Hills', city: 'Boulogne-Billancourt', address: '14 Route de la Reine', lat: 48.8397, lng: 2.2399, cats: ['womens_haircut', 'nails', 'henna'], home: true },
    { name: 'Luther Hammes Grooming', city: 'Saint-Denis', address: '5 Rue de la République', lat: 48.9362, lng: 2.3574, cats: ['mens_haircut', 'kids', 'facial'], home: false },
    { name: 'Casa Henna & Nails', city: 'Paris', address: '90 Rue de Belleville', lat: 48.8722, lng: 2.3846, cats: ['henna', 'nails', 'waxing'], home: true },
    { name: 'Robert Gleichner Hair', city: 'Vincennes', address: '22 Avenue de Paris', lat: 48.8474, lng: 2.4393, cats: ['mens_haircut', 'coloring'], home: false },
  ],
};

// Which set to create: SEED_REGION=islamabad (default) or paris
const REGION = process.env.SEED_REGION === 'paris' ? paris : islamabad;
const salons = REGION.salons;
const COUNTRY = REGION.country;
const CURRENCY = REGION.currency;
const TZ = REGION.timezone;
/** Prices in the smallest unit of the currency (cents / paisa). */
const priceOf = (t: { cents: number; pkr: number }) => (CURRENCY === 'PKR' ? t.pkr * 100 : t.cents);

const specialistPoolEurope: { name: string; title: L }[] = [
  { name: 'Luther Hammes', title: { en: 'Senior barber', fr: 'Barbier senior', de: 'Senior-Barbier' } },
  { name: 'Alan Cartwright', title: { en: 'Hair stylist', fr: 'Coiffeur styliste', de: 'Hairstylist' } },
  { name: 'Sergio Wilderman', title: { en: 'Barber', fr: 'Barbier', de: 'Barbier' } },
  { name: 'Robert Gleichner', title: { en: 'Colour specialist', fr: 'Coloriste', de: 'Colorist' } },
  { name: 'Jessica Miller', title: { en: 'Hair stylist', fr: 'Coiffeuse styliste', de: 'Hairstylistin' } },
  { name: 'Emma Moore', title: { en: 'Beautician', fr: 'Esthéticienne', de: 'Kosmetikerin' } },
  { name: 'David Martin', title: { en: 'Barber', fr: 'Barbier', de: 'Barbier' } },
  { name: 'Joseph Garcia', title: { en: 'Junior stylist', fr: 'Coiffeur junior', de: 'Junior-Stylist' } },
];

const specialistPoolPakistan: { name: string; title: L }[] = [
  { name: 'Ali Raza', title: { en: 'Senior barber', fr: 'Barbier senior', de: 'Senior-Barbier' } },
  { name: 'Ayesha Malik', title: { en: 'Hair stylist', fr: 'Coiffeuse styliste', de: 'Hairstylistin' } },
  { name: 'Usman Khan', title: { en: 'Barber', fr: 'Barbier', de: 'Barbier' } },
  { name: 'Sana Iqbal', title: { en: 'Makeup artist', fr: 'Maquilleuse', de: 'Visagistin' } },
  { name: 'Bilal Ahmed', title: { en: 'Colour specialist', fr: 'Coloriste', de: 'Colorist' } },
  { name: 'Hina Shah', title: { en: 'Beautician', fr: 'Esthéticienne', de: 'Kosmetikerin' } },
  { name: 'Fatima Noor', title: { en: 'Henna artist', fr: 'Artiste henné', de: 'Henna-Künstlerin' } },
  { name: 'Zainab Ali', title: { en: 'Nail technician', fr: 'Prothésiste ongulaire', de: 'Nageldesignerin' } },
];
const specialistPool = REGION === paris ? specialistPoolEurope : specialistPoolPakistan;

const reviewerNames =
  REGION === paris
    ? ['Andrew Allen', 'Anthony Walker', 'Jonathan Hernandez', 'Steven Wright', 'Charles Rodriguez']
    : ['Hamza Tariq', 'Sara Khan', 'Omar Farooq', 'Maryam Javed', 'Ahmed Raza'];

const reviewComments = [
  'Great service, very professional and friendly. I recommend!',
  'Exactly the cut I asked for. Clean place and on time.',
  'Price is a bit high but the result is worth it.',
  'Very relaxing, they took their time. Will come back.',
  'Good overall, a short wait before my appointment.',
];

const reviewTags = [
  ['overall_good', 'good_service'],
  ['great_result', 'recommend'],
  ['satisfying'],
  ['comfortable', 'good_price'],
  ['good_service'],
];

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('Seeding...');

  // Categories (upsert so the seed can be re-run)
  const catByKey: Record<string, string> = {};
  for (const [i, c] of categories.entries()) {
    const row = await prisma.category.upsert({
      where: { key: c.key },
      update: { name: c.name, icon: c.icon, sortOrder: i },
      create: { key: c.key, name: c.name, icon: c.icon, sortOrder: i },
    });
    catByKey[c.key] = row.id;
  }

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const password = await hashPassword('Password123!');

  // ── Users ──
  const demo = await upsertUser('demo@casacut.app', 'Joe Samanta', '612345678', password);
  const owner = await upsertUser('owner@casacut.app', 'Luther Hammes', '612345600', password, 'SALON_OWNER');
  const reviewers = [];
  for (const [i, name] of reviewerNames.entries()) {
    const email = `${slugify(name)}@example.com`;
    reviewers.push(await upsertUser(email, name, `6990000${String(i).padStart(2, '0')}`, password));
  }

  // ── Wipe previous demo salons (bookings first: a salon with bookings can't be deleted) ──
  const slugs = [...islamabad.salons, ...paris.salons].map((s) => slugify(s.name));
  await prisma.booking.deleteMany({ where: { salon: { slug: { in: slugs } } } });
  await prisma.salon.deleteMany({ where: { slug: { in: slugs } } });

  const createdSalons = [];
  for (const [i, s] of salons.entries()) {
    const slug = slugify(s.name);
    const services = s.cats.flatMap((key) =>
      (serviceTemplates[key] ?? []).map((t, j) => ({
        name: t.name,
        durationMinutes: t.minutes,
        priceCents: priceOf(t),
        categoryId: catByKey[key],
        availableAtHome: s.home,
        sortOrder: j,
      })),
    );
    const priceFromCents = Math.min(...services.map((x) => x.priceCents));

    const salon = await prisma.salon.create({
      data: {
        ownerId: i === 0 ? owner.id : null,
        name: s.name,
        slug,
        description: {
          en: `${s.name} is a team of qualified stylists dedicated to giving you a look you love, in a relaxed and friendly setting.`,
          fr: `${s.name} est une équipe de coiffeurs qualifiés qui vous offrent la coupe que vous aimez, dans une ambiance détendue et conviviale.`,
          de: `${s.name} ist ein Team qualifizierter Stylisten, das dir in entspannter, freundlicher Atmosphäre einen Look schenkt, den du liebst.`,
        },
        addressLine: s.address,
        city: s.city,
        country: COUNTRY,
        latitude: s.lat,
        longitude: s.lng,
        currency: CURRENCY,
        phone: s.phone ?? null,
        website: s.website ?? null,
        coverImageUrl: `https://picsum.photos/seed/casacut-${slug}/800/500`,
        priceFromCents,
        offersHomeService: s.home,
        timezone: TZ,
        status: 'ACTIVE',
        categories: { create: s.cats.map((key) => ({ categoryId: catByKey[key] })) },
        images: {
          create: [0, 1, 2].map((n) => ({
            url: `https://picsum.photos/seed/casacut-${slug}-${n}/600/600`,
            sortOrder: n,
          })),
        },
        services: { create: services },
        // Every day, 11:00-21:00 unless the salon says otherwise (24 h for World Style Saloon)
        openingHours: {
          create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            openMinute: (s.hours ?? [11 * 60, 21 * 60])[0],
            closeMinute: (s.hours ?? [11 * 60, 21 * 60])[1],
          })),
        },
        specialists: {
          create: [0, 1, 2].map((n) => {
            const sp = specialistPool[(i * 3 + n) % specialistPool.length];
            return {
              name: sp.name,
              title: sp.title,
              avatarUrl: `https://i.pravatar.cc/200?u=${slugify(sp.name)}-${i}`,
              sortOrder: n,
            };
          }),
        },
      },
      include: { services: true, specialists: true },
    });
    createdSalons.push(salon);

    if (i % 3 === 0) {
      await prisma.offer.create({
        data: {
          salonId: salon.id,
          title: {
            en: `${[30, 20, 15, 25][i % 4]}% off your first visit`,
            fr: `${[30, 20, 15, 25][i % 4]}% de réduction sur votre première visite`,
            de: `${[30, 20, 15, 25][i % 4]}% Rabatt auf deinen ersten Besuch`,
          },
          discountPercent: [30, 20, 15, 25][i % 4],
          imageUrl: `https://picsum.photos/seed/casacut-offer-${slug}/800/500`,
          startsAt: now,
          endsAt: in30Days,
        },
      });
    }

    // Past visits with reviews (2-5 per salon), then the salon rating is computed from them
    const reviewCount = 2 + (i % 4);
    for (let r = 0; r < reviewCount; r++) {
      const reviewer = reviewers[(i + r) % reviewers.length];
      const day = addDays(todayInTz(), -(3 + r * 4 + i));
      const booking = await createBooking({
        customerId: reviewer.id,
        salon,
        service: salon.services[r % salon.services.length],
        specialistId: salon.specialists[r % 3].id,
        day,
        minute: (12 + r) * 60, // inside opening hours
        status: 'COMPLETED',
      });
      const rating = Math.max(3, 5 - ((i + r) % 3));
      await prisma.review.create({
        data: {
          bookingId: booking.id,
          userId: reviewer.id,
          salonId: salon.id,
          specialistId: booking.specialistId,
          rating,
          comment: reviewComments[(i + r) % reviewComments.length],
          tags: reviewTags[(i + r) % reviewTags.length],
          createdAt: booking.endAt,
        },
      });
    }
    const agg = await prisma.review.aggregate({ where: { salonId: salon.id }, _avg: { rating: true }, _count: { _all: true } });
    await prisma.salon.update({
      where: { id: salon.id },
      data: { avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10, reviewCount: agg._count._all },
    });
  }

  // ── Demo customer's own bookings, so every state of the Bookings tab can be seen ──
  const [masterpiece, jessica, james] = createdSalons;
  await createBooking({
    customerId: demo.id,
    salon: masterpiece,
    service: masterpiece.services[0],
    specialistId: masterpiece.specialists[0].id,
    day: addDays(todayInTz(), 1),
    minute: 12 * 60,
    status: 'CONFIRMED',
  });
  await createBooking({
    customerId: demo.id,
    salon: jessica,
    service: jessica.services[0],
    specialistId: jessica.specialists[1].id,
    day: addDays(todayInTz(), -1),
    minute: 15 * 60,
    status: 'COMPLETED',
    completedAt: new Date(now.getTime() - 3 * 3600 * 1000), // finished recently → "Rate" button
  });
  await createBooking({
    customerId: demo.id,
    salon: james,
    service: james.services[0],
    specialistId: james.specialists[0].id,
    day: addDays(todayInTz(), -6),
    minute: 13 * 60,
    status: 'CANCELLED',
  });

  // ── Coupons ──
  await prisma.coupon.upsert({
    where: { code: 'MT10' },
    update: { isActive: true, endsAt: null },
    create: { code: 'MT10', percentOff: 10, maxUsesPerUser: 5 },
  });
  await prisma.coupon.upsert({
    where: { code: 'WELCOME5' },
    update: {
      isActive: true,
      amountOffCents: CURRENCY === 'PKR' ? 20000 : 500,
      minSubtotalCents: CURRENCY === 'PKR' ? 100000 : 2000,
    },
    create: {
      code: 'WELCOME5',
      // 5 EUR off from 20 EUR, or Rs 200 off from Rs 1,000
      amountOffCents: CURRENCY === 'PKR' ? 20000 : 500,
      minSubtotalCents: CURRENCY === 'PKR' ? 100000 : 2000,
    },
  });

  console.log(`Seeded ${categories.length} categories, ${salons.length} salons with team, hours and reviews.`);
  console.log('Customer login:     demo@casacut.app  / Password123!');
  console.log(`Salon owner login:  owner@casacut.app / Password123!  (owns ${salons[0].name})`);
  console.log('Coupons: MT10 (10% off), WELCOME5 (fixed amount off)');
}

// ───────────────────────── helpers ─────────────────────────

async function upsertUser(email: string, name: string, phone: string, passwordHash: string, role: 'CUSTOMER' | 'SALON_OWNER' = 'CUSTOMER') {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return prisma.user.update({ where: { email }, data: { role } });

  // Phone numbers are unique. An older seed run (or a real sign-up) may already use this
  // demo number, so take the next free one instead of failing.
  let free = phone;
  for (let n = 1; await prisma.user.findFirst({ where: { phoneCountryCode: '+33', phone: free }, select: { id: true } }); n++) {
    free = `${phone.slice(0, -3)}${String((Number(phone.slice(-3)) + n) % 1000).padStart(3, '0')}`;
  }
  return prisma.user.create({
    data: { email, name, phoneCountryCode: '+33', phone: free, passwordHash, role, emailVerifiedAt: new Date(), language: 'en' },
  });
}

function todayInTz() {
  return zonedDateString(new Date(), TZ);
}

async function createBooking(p: {
  customerId: string;
  salon: { id: string; currency: string };
  service: { id: string; name: unknown; priceCents: number; durationMinutes: number };
  specialistId: string;
  day: string;
  minute: number;
  status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  completedAt?: Date;
}) {
  const startAt = zonedToUtc(p.day, p.minute, TZ);
  const endAt = new Date(startAt.getTime() + p.service.durationMinutes * 60_000);
  const fee = CURRENCY === 'PKR' ? 10000 : 200; // Rs 100 or 2.00 EUR
  return prisma.booking.create({
    data: {
      reference: `CC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: p.customerId,
      salonId: p.salon.id,
      specialistId: p.specialistId,
      startAt,
      endAt,
      status: p.status,
      subtotalCents: p.service.priceCents,
      serviceFeeCents: fee,
      totalCents: p.service.priceCents + fee,
      currency: p.salon.currency,
      completedAt: p.status === 'COMPLETED' ? (p.completedAt ?? endAt) : null,
      cancelledAt: p.status === 'CANCELLED' ? startAt : null,
      cancelReason: p.status === 'CANCELLED' ? 'Change of plans' : null,
      services: {
        create: [
          {
            serviceId: p.service.id,
            name: p.service.name as Prisma.InputJsonValue,
            priceCents: p.service.priceCents,
            durationMinutes: p.service.durationMinutes,
          },
        ],
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

  