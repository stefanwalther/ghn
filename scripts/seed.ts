import { seedDatabase } from "@/lib/seed";

const result = await seedDatabase();
console.log(JSON.stringify(result));
