"use client";

/**
 * Contact Autocomplete Component
 * Autocomplete pour rechercher des contacts depuis la base Tiers
 */

import { useState, useEffect, useCallback } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  function?: string;
  email?: string;
  phone?: string;
  lastVisitDate?: string;
  // Dernières informations connues pour auto-fill
  lastProject?: string;
  lastSite?: string;
  lastAccommodation?: string;
}

interface ContactAutocompleteProps {
  value?: Contact;
  onChange: (contact: Contact | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ContactAutocomplete({
  value,
  onChange,
  placeholder = "Rechercher un contact...",
  disabled = false,
}: ContactAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!search || search.length < 2) {
      setContacts([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        // Appeler l'API Tiers pour rechercher les contacts
        const response = await fetch(
          `/api/v1/contacts/search?q=${encodeURIComponent(search)}`,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include', // Important pour les cookies de session
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Transform API response to Contact interface
        const transformedContacts: Contact[] = data.data.map((apiContact: any) => ({
          id: apiContact.id,
          firstName: apiContact.first_name,
          lastName: apiContact.last_name,
          company: apiContact.company_name,
          function: apiContact.position,
          email: apiContact.email,
          phone: apiContact.phone,
          lastVisitDate: apiContact.last_contact,
          // These fields would come from a more detailed endpoint or be stored separately
          lastProject: undefined,
          lastSite: undefined,
          lastAccommodation: undefined,
        }));

        setContacts(transformedContacts);
      } catch (error) {
        console.error("Error searching contacts:", error);
        // Fallback to empty results on error
        setContacts([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const selectedContact = value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedContact ? (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{`${selectedContact.firstName} ${selectedContact.lastName}`}</span>
              <span className="text-xs text-muted-foreground">({selectedContact.company})</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Tapez pour rechercher..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Recherche...</span>
              </div>
            ) : contacts.length === 0 && search.length >= 2 ? (
              <CommandEmpty>Aucun contact trouvé</CommandEmpty>
            ) : (
              <CommandGroup>
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={contact.id}
                    onSelect={() => {
                      onChange(contact);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {contact.firstName} {contact.lastName}
                          </span>
                          {selectedContact?.id === contact.id && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Building2 className="h-3 w-3" />
                          {contact.company}
                          {contact.function && ` • ${contact.function}`}
                        </div>
                        {contact.lastVisitDate && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Dernier séjour : {new Date(contact.lastVisitDate).toLocaleDateString("fr-FR")}
                          </div>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
