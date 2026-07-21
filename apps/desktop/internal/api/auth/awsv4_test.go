package auth

import "testing"

func TestCanonicalQueryString(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "empty",
			in:   "",
			want: "",
		},
		{
			name: "single pair already sorted",
			in:   "a=1",
			want: "a=1",
		},
		{
			name: "out of order keys",
			in:   "b=2&a=1",
			want: "a=1&b=2",
		},
		{
			name: "duplicate keys sorted by value",
			in:   "k=2&k=1",
			want: "k=1&k=2",
		},
		{
			name: "space encoded as percent20 not plus",
			in:   "q=hello+world",
			want: "q=hello%20world",
		},
		{
			name: "reserved char encoded",
			in:   "q=a/b",
			want: "q=a%2Fb",
		},
		{
			name: "unreserved chars preserved",
			in:   "q=A-Z_a-z.0-9~",
			want: "q=A-Z_a-z.0-9~",
		},
		{
			name: "empty value preserved",
			in:   "a=&b=1",
			want: "a=&b=1",
		},
		{
			name: "key only (no equals)",
			in:   "flag",
			want: "flag=",
		},
		{
			name: "uppercase hex on re-encoding",
			in:   "q=a%2fb",
			want: "q=a%2Fb",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canonicalQueryString(tt.in)
			if got != tt.want {
				t.Fatalf("canonicalQueryString(%q):\n  got:  %q\n  want: %q", tt.in, got, tt.want)
			}
		})
	}
}
