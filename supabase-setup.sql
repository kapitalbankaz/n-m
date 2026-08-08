-- ============================================================
-- CRM System - Supabase Database Setup
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES TABLE (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PHONE NUMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  phone_display TEXT NOT NULL, -- formatted: 055 123 45 67
  status TEXT NOT NULL DEFAULT 'Yeni' CHECK (status IN (
    'Yeni', 'Danışılır', 'Cavab vermədi', 'Nömrə işləmir',
    'Razı olmadı', 'Gələcəkdə ala bilər', 'Maraqlanır', 'Müştəri oldu'
  )),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_contact_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone_id UUID REFERENCES public.phone_numbers(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HISTORY TABLE (contact history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone_id UUID REFERENCES public.phone_numbers(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_phone_numbers_assigned_to ON public.phone_numbers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON public.phone_numbers(status);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_next_contact ON public.phone_numbers(next_contact_date);
CREATE INDEX IF NOT EXISTS idx_notes_phone_id ON public.notes(phone_id);
CREATE INDEX IF NOT EXISTS idx_history_phone_id ON public.contact_history(phone_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON public.contact_history(created_at);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'admin');

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.get_my_role() = 'admin');

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- ============================================================
-- PHONE NUMBERS POLICIES
-- ============================================================

-- Workers can only see their own numbers
CREATE POLICY "Workers see own numbers" ON public.phone_numbers
  FOR SELECT USING (
    public.get_my_role() = 'admin' OR assigned_to = auth.uid()
  );

-- Admins can insert numbers
CREATE POLICY "Admins can insert numbers" ON public.phone_numbers
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- Admins can update any number; workers can only update their own
CREATE POLICY "Admins update any, workers update own" ON public.phone_numbers
  FOR UPDATE USING (
    public.get_my_role() = 'admin' OR assigned_to = auth.uid()
  );

-- Only admins can delete numbers
CREATE POLICY "Only admins can delete numbers" ON public.phone_numbers
  FOR DELETE USING (public.get_my_role() = 'admin');

-- ============================================================
-- NOTES POLICIES
-- ============================================================

-- Workers see notes for their numbers; admins see all
CREATE POLICY "Notes visibility" ON public.notes
  FOR SELECT USING (
    public.get_my_role() = 'admin' OR worker_id = auth.uid()
  );

-- Workers can insert notes for their own numbers
CREATE POLICY "Insert notes" ON public.notes
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'admin' OR (
      worker_id = auth.uid() AND
      EXISTS (
        SELECT 1 FROM public.phone_numbers
        WHERE id = phone_id AND assigned_to = auth.uid()
      )
    )
  );

-- Workers can update their own notes
CREATE POLICY "Update own notes" ON public.notes
  FOR UPDATE USING (
    public.get_my_role() = 'admin' OR worker_id = auth.uid()
  );

-- ============================================================
-- CONTACT HISTORY POLICIES
-- ============================================================

-- Workers see history for their numbers; admins see all
CREATE POLICY "History visibility" ON public.contact_history
  FOR SELECT USING (
    public.get_my_role() = 'admin' OR worker_id = auth.uid()
  );

-- Workers can insert history for their numbers
CREATE POLICY "Insert history" ON public.contact_history
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'admin' OR (
      worker_id = auth.uid() AND
      EXISTS (
        SELECT 1 FROM public.phone_numbers
        WHERE id = phone_id AND assigned_to = auth.uid()
      )
    )
  );

-- ============================================================
-- INITIAL PHONE NUMBERS (10 sample numbers)
-- ============================================================
INSERT INTO public.phone_numbers (phone, phone_display, status) VALUES
  ('0553747799', '055 374 77 99', 'Yeni'),
  ('0556000695', '055 600 06 95', 'Yeni'),
  ('0506075554', '050 607 55 54', 'Yeni'),
  ('0552735511', '055 273 55 11', 'Yeni'),
  ('0552227759', '055 222 77 59', 'Yeni'),
  ('0242448783', '024 244 87 83', 'Yeni'),
  ('0103246134', '010 324 61 34', 'Yeni'),
  ('0705406674', '070 540 66 74', 'Yeni'),
  ('0519623515', '051 962 35 15', 'Yeni'),
  ('0554242524', '055 424 25 24', 'Yeni')
ON CONFLICT (phone) DO NOTHING;

-- ============================================================
-- CREATE ADMIN USER (run after creating user in Auth)
-- Replace 'admin@example.com' with your admin email
-- After creating user via Auth, run:
-- UPDATE public.profiles SET role = 'admin', full_name = 'Admin' WHERE email = 'admin@example.com';
-- ============================================================
