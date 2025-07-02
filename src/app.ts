import express from "express";
import { Request,Response } from "express";
import { Contact, PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

app.post("/identity", async (req,res) : Promise<any>=>{
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber is required" });
  }

  // Step 1: Find all matching contacts (email or phone)
  const matchingContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email: email || undefined },
        { phoneNumber: phoneNumber || undefined },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  let primaryContact:Contact;
  let allContacts: typeof matchingContacts = [];

  if (matchingContacts.length === 0) {
    // No match — create new PRIMARY contact
    primaryContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "PRIMARY",
      },
    });
    allContacts = [primaryContact];
  } else {
    // Step 2: Find all linked contacts (directly or indirectly)
    const allLinkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: { in: matchingContacts.map((c) => c.id) } },
          { linkedId: { in: matchingContacts.map((c) => c.id) } },
        ],
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });

    allContacts = allLinkedContacts;
 // Step 3: Identify the oldest PRIMARY as the true primary
    primaryContact =
      allLinkedContacts.find((c) => c.linkPrecedence === "PRIMARY") ||
      allLinkedContacts[0];

    // Step 4: Demote any newer PRIMARYs to SECONDARY
    const contactsToUpdate = allLinkedContacts.filter(
      (c) =>
        c.linkPrecedence === "PRIMARY" &&
        c.id !== primaryContact.id
    );

    for (const contact of contactsToUpdate) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          linkPrecedence: "SECONDARY",
          linkedId: primaryContact.id,
          updatedAt: new Date(),
        },
      });
    }

    // Step 5: Check if an exact (email + phone) match exists
    const alreadyExists = allLinkedContacts.some(
      (c) => c.email === email && c.phoneNumber === phoneNumber
    );

    if (!alreadyExists) {
      await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkedId: primaryContact.id,
          linkPrecedence: "SECONDARY",
        },
      });
    }

    // Step 6: Fetch updated list of all linked contacts
    allContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primaryContact.id },
          { linkedId: primaryContact.id },
        ],
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // Prepare response
  const emails = Array.from(
    new Set(allContacts.map((c) => c.email).filter(Boolean))
  );
  const phoneNumbers = Array.from(
    new Set(allContacts.map((c) => c.phoneNumber).filter(Boolean))
  );
  const secondaryContactIds = allContacts
    .filter((c) => c.id !== primaryContact.id)
    .map((c) => c.id);

  return res.json({
    contact: {
      primaryContactId: primaryContact.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  });
});
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
