'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { BookmarkCatalog } from '@/components/chat/BookmarkCatalog';

export default function BookmarksPage() {
    return (
        <DashboardLayout title="Saved analyses" subtitle="Bookmarked Q&A — search, filter, and group" noPadding>
            <div className="h-[calc(100vh-72px)]">
                <BookmarkCatalog variant="page" />
            </div>
        </DashboardLayout>
    );
}
