import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { TabNav } from '../components/tab-nav';
import { FieldGroup } from '../components/field-group';
import { FormField } from '../components/form';

afterEach(cleanup);

describe('TabNav', () => {
  it('renders all tab buttons', () => {
    const tabs = [
      { key: 'a', label: 'Tab A' },
      { key: 'b', label: 'Tab B' },
    ];
    render(<TabNav tabs={tabs} activeTab="a" onTabChange={() => {}} />);

    expect(screen.getByText('Tab A')).toBeDefined();
    expect(screen.getByText('Tab B')).toBeDefined();
  });

  it('marks active tab with active class', () => {
    const tabs = [
      { key: 'a', label: 'Tab A' },
      { key: 'b', label: 'Tab B' },
    ];
    render(<TabNav tabs={tabs} activeTab="a" onTabChange={() => {}} />);

    const tabA = screen.getByText('Tab A');
    const tabB = screen.getByText('Tab B');
    expect(tabA.className).toContain('active');
    expect(tabB.className).not.toContain('active');
  });

  it('calls onTabChange when tab clicked', () => {
    const tabs = [
      { key: 'a', label: 'Tab A' },
      { key: 'b', label: 'Tab B' },
    ];
    const onTabChange = vi.fn();
    render(<TabNav tabs={tabs} activeTab="a" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('Tab B'));
    expect(onTabChange).toHaveBeenCalledWith('b');
  });

  it('renders with empty tabs', () => {
    const { container } = render(
      <TabNav tabs={[]} activeTab="" onTabChange={() => {}} />,
    );

    const nav = container.querySelector('.tab-nav');
    expect(nav).toBeDefined();
    expect(nav?.querySelectorAll('.tab-btn').length).toBe(0);
  });
});

describe('FieldGroup', () => {
  it('renders fieldset with legend', () => {
    const { container } = render(
      <FieldGroup legend="Test Group">
        <p>Content</p>
      </FieldGroup>,
    );

    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toBeDefined();
    expect(screen.getByText('Test Group')).toBeDefined();
  });

  it('renders children inside group', () => {
    render(
      <FieldGroup legend="Group">
        <p>Child</p>
      </FieldGroup>,
    );

    expect(screen.getByText('Child')).toBeDefined();
  });

  it('renders description when provided', () => {
    render(
      <FieldGroup legend="Group" description="Help text">
        <p>Content</p>
      </FieldGroup>,
    );

    expect(screen.getByText('Help text')).toBeDefined();
  });

  it('does not render description when not provided', () => {
    const { container } = render(
      <FieldGroup legend="Group">
        <p>Content</p>
      </FieldGroup>,
    );

    const desc = container.querySelector('.field-group-description');
    expect(desc).toBeNull();
  });
});

describe('FormField description', () => {
  it('renders description text below input', () => {
    render(
      <FormField
        label="Name"
        name="name"
        value=""
        onChange={() => {}}
        description="Enter your name"
      />,
    );

    expect(screen.getByText('Enter your name')).toBeDefined();
  });

  it('does not render description when not provided', () => {
    const { container } = render(
      <FormField label="Name" name="name" value="" onChange={() => {}} />,
    );

    const desc = container.querySelector('.form-description');
    expect(desc).toBeNull();
  });

  it('renders description for checkbox type', () => {
    render(
      <FormField
        label="Enable"
        name="enable"
        type="checkbox"
        value={false}
        onChange={() => {}}
        description="Enable feature"
      />,
    );

    expect(screen.getByText('Enable feature')).toBeDefined();
  });
});
