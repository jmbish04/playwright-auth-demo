-- Insert LinkedIn configuration
INSERT INTO site_config (
    url_pattern,
    username_secret_var,
    password_secret_var,
    login_url,
    login_agent_instructions
) VALUES (
    'linkedin.com/jobs/view',
    'LINKEDIN_USERNAME',
    'LINKEDIN_PASSWORD',
    'https://www.linkedin.com/login',
    'Navigate to LinkedIn login page, enter credentials, and handle any 2FA or security challenges. Look for username/email field, password field, and sign-in button.'
);

-- Insert Indeed configuration
INSERT INTO site_config (
    url_pattern,
    username_secret_var,
    password_secret_var,
    login_url,
    login_agent_instructions
) VALUES (
    'indeed.com/viewjob',
    'INDEED_USERNAME',
    'INDEED_PASSWORD',
    'https://secure.indeed.com/account/login',
    'Navigate to Indeed login page, enter email and password credentials. Look for email field, password field, and sign-in button.'
);

-- Insert Glassdoor configuration
INSERT INTO site_config (
    url_pattern,
    username_secret_var,
    password_secret_var,
    login_url,
    login_agent_instructions
) VALUES (
    'glassdoor.com/job-listing',
    'GLASSDOOR_USERNAME',
    'GLASSDOOR_PASSWORD',
    'https://www.glassdoor.com/profile/login_input.htm',
    'Navigate to Glassdoor login page, enter email and password credentials. Handle any CAPTCHA or additional verification steps.'
);